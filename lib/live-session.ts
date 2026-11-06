import type * as Y from 'yjs'
import { type Awareness, removeAwarenessStates } from 'y-protocols/awareness'
import { createLiveProvider, type LiveChannel, type LiveProvider } from './live-provider'
import type { Result } from './types'

export type LostReason = 'no_access' | 'session'

export interface LiveSession {
  /** For CollaborationCaret.configure({ provider }); stable across rejoins. */
  readonly awareness: Awareness
  /** Origin of all remote updates, across rejoins (the saver ignores these). */
  readonly origin: symbol
  readonly epoch: number
  send(event: string, payload: Record<string, unknown>): void
  /** The server reported this epoch (e.g. in a save result): move there if it is newer. */
  noteEpoch(epoch: number): void
  /** Owner, after a successful unshare: tell the old topic, then move to the new epoch. */
  rekey(): Promise<void>
  destroy(): void
}

/**
 * A live connection that follows the doc's share epoch (topic `doc:{id}:{epoch}`).
 * `rekey` broadcasts, `title` broadcasts and CHANNEL_ERROR all make it re-ask the server:
 * a newer epoch means rejoin on the new topic with the same Y.Doc and awareness (the provider's
 * sync brings both sides up to date); not_found/unauthorized means access is gone.
 * Payloads are never trusted: a title broadcast only triggers a fetch of the real title.
 */
export function createLiveSession(opts: {
  ydoc: Y.Doc
  awareness: Awareness
  epoch: number
  channelFor: (epoch: number) => LiveChannel
  fetchLive: () => Promise<Result<{ epoch: number; title: string }>>
  onPeers?: (names: string[]) => void
  onTitle?: (title: string) => void
  onLost?: (reason: LostReason) => void
  /** Minimum gap between CHANNEL_ERROR-triggered refetches. */
  errorRefetchMs?: number
}): LiveSession {
  const { ydoc, awareness, channelFor, fetchLive, onPeers, onTitle, onLost } = opts
  const errorRefetchMs = opts.errorRefetchMs ?? 3000
  const origin = Symbol('live-session')
  let epoch = opts.epoch
  let ended = false
  let provider: LiveProvider
  let lastErrorRefetch = -Infinity

  function connect(e: number) {
    const channel = channelFor(e)
    channel.on('rekey', () => void refresh(false))
    channel.on('title', () => void refresh(true))
    provider = createLiveProvider({
      channel,
      ydoc,
      awareness,
      origin,
      onPeers,
      onStatus: (status) => {
        if (status !== 'CHANNEL_ERROR' || ended) return
        // Maybe the epoch moved on (or access is gone); supabase-js keeps retrying meanwhile.
        if (Date.now() - lastErrorRefetch < errorRefetchMs) return
        lastErrorRefetch = Date.now()
        void refresh(false)
      },
    })
  }

  function rejoin(e: number) {
    const local = awareness.getLocalState()
    provider.destroy() // says goodbye on the old topic (clears the local state)
    const others = [...awareness.getStates().keys()].filter((id) => id !== awareness.clientID)
    if (others.length) removeAwarenessStates(awareness, others, 'rejoin') // they re-announce on the new topic
    onPeers?.([])
    if (local) awareness.setLocalState(local)
    epoch = e
    connect(e)
  }

  function lose(reason: LostReason) {
    if (ended) return
    ended = true
    provider.destroy()
    onLost?.(reason)
  }

  // Serialized: a request made while one is in flight runs once more afterwards.
  let running = false
  let again = false
  let wantTitle = false
  async function refresh(title: boolean): Promise<void> {
    wantTitle ||= title
    if (running) {
      again = true
      return
    }
    running = true
    try {
      do {
        again = false
        const withTitle = wantTitle
        wantTitle = false
        let res: Result<{ epoch: number; title: string }>
        try {
          res = await fetchLive()
        } catch {
          return // offline: the next event or error tries again
        }
        if (ended) return
        if (!res.ok) {
          if (res.error === 'not_found' || res.error === 'forbidden') lose('no_access')
          else if (res.error === 'unauthorized') lose('session')
          return
        }
        if (withTitle) onTitle?.(res.value.title)
        if (res.value.epoch > epoch) rejoin(res.value.epoch) // a stale (lower) answer never moves us back
      } while (again && !ended)
    } finally {
      running = false
    }
  }

  connect(epoch)

  return {
    awareness,
    origin,
    get epoch() {
      return epoch
    },
    send: (event, payload) => provider.send(event, payload),
    noteEpoch(e) {
      if (!ended && e > epoch) rejoin(e)
    },
    async rekey() {
      if (ended) return
      provider.send('rekey', {})
      await refresh(false)
    },
    destroy() {
      ended = true
      provider.destroy()
    },
  }
}
