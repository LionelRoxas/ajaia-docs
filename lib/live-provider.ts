import * as Y from 'yjs'
import {
  type Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { fromB64, toB64 } from './ydoc'

/** Thin broadcast channel: payloads are JSON; the sender never receives its own messages. */
export interface LiveChannel {
  send(event: string, payload: Record<string, unknown>): void
  on(event: string, cb: (payload: Record<string, unknown>) => void): void
  /** cb gets the channel status; 'SUBSCRIBED' may fire again after a reconnect. */
  subscribe(cb: (status: string, err?: Error) => void): void
  unsubscribe(): void
}

export interface LiveProvider {
  /** Pass the provider to CollaborationCaret.configure({ provider }); it reads `awareness`. */
  awareness: Awareness
  /** Origin of remote updates applied to the ydoc; anything else is a local edit. */
  origin: symbol
  /** Broadcast an app event (e.g. `title`); dropped while not subscribed. */
  send(event: string, payload: Record<string, unknown>): void
  destroy(): void
}

// supabase-js closes its socket in its own window `pagehide` listener, and listeners on the window
// run in registration order (capture or not). So one listener is registered when this module loads,
// before any Supabase client exists, and providers hook into it to say goodbye while the socket is open.
const pageHideHooks = new Set<() => void>()
let hookedWindow: EventTarget | null = null
function hookPageHide(win: EventTarget) {
  if (hookedWindow === win) return
  hookedWindow = win
  win.addEventListener('pagehide', () => pageHideHooks.forEach((h) => h()))
}
if (typeof window !== 'undefined') hookPageHide(window)

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] }

export function createLiveProvider(opts: {
  channel: LiveChannel
  ydoc: Y.Doc
  awareness: Awareness
  onPeers?: (names: string[]) => void
  onStatus?: (status: string, err?: Error) => void
}): LiveProvider {
  const { channel, ydoc, awareness, onPeers, onStatus } = opts
  const origin = Symbol('live-provider')
  let ready = false
  let destroyed = false

  const send = (event: string, payload: Record<string, unknown>) => {
    if (ready && !destroyed) channel.send(event, payload)
  }
  const sendAwareness = (clients: number[]) =>
    send('awareness', { a: toB64(encodeAwarenessUpdate(awareness, clients)) })

  const onDocUpdate = (update: Uint8Array, o: unknown) => {
    if (o !== origin) send('update', { u: toB64(update) })
  }

  const onAwarenessUpdate = ({ added, updated, removed }: AwarenessChange, o: unknown) => {
    if (o === origin) return
    const self = awareness.clientID
    if ([...added, ...updated, ...removed].includes(self)) sendAwareness([self])
  }

  let lastPeers = ''
  const reportPeers = () => {
    if (!onPeers) return
    const names: string[] = []
    awareness.getStates().forEach((state, id) => {
      const name = (state as { user?: { name?: unknown } }).user?.name
      if (id !== awareness.clientID && typeof name === 'string' && !names.includes(name)) names.push(name)
    })
    names.sort()
    const key = JSON.stringify(names)
    if (key !== lastPeers) {
      lastPeers = key
      onPeers(names)
    }
  }

  const sendSync = (reply?: boolean) => send('sync', { sv: toB64(Y.encodeStateVector(ydoc)), ...(reply ? { reply } : {}) })

  // Malformed payloads are ignored: one bad message must not break the session.
  const handle = (event: string, cb: (p: Record<string, unknown>) => void) =>
    channel.on(event, (p) => {
      if (destroyed) return
      try {
        cb(p)
      } catch {
        // ignore malformed payload
      }
    })

  handle('update', (p) => {
    if (typeof p.u !== 'string') return
    Y.applyUpdate(ydoc, fromB64(p.u), origin)
    // A gap (e.g. a dropped message) parks updates as pending: ask peers for what's missing.
    if (ydoc.store.pendingStructs !== null || ydoc.store.pendingDs !== null) sendSync()
  })
  handle('sync', (p) => {
    if (typeof p.sv !== 'string') return
    send('update', { u: toB64(Y.encodeStateAsUpdate(ydoc, fromB64(p.sv))) })
    sendAwareness([awareness.clientID])
    // Ask the joiner back for anything it had before connecting; replies don't recurse.
    if (!p.reply) sendSync(true)
  })
  handle('awareness', (p) => {
    if (typeof p.a === 'string') applyAwarenessUpdate(awareness, fromB64(p.a), origin)
  })

  // Leaving the page: drop our caret for peers right away instead of after the awareness timeout.
  let hiddenState: Record<string, unknown> | null = null
  const onPageHide = () => {
    hiddenState = awareness.getLocalState()
    if (hiddenState) removeAwarenessStates(awareness, [awareness.clientID], 'pagehide')
  }
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted && hiddenState && !destroyed) awareness.setLocalState(hiddenState)
    hiddenState = null
  }
  const win = typeof window === 'undefined' ? null : window
  if (win) {
    hookPageHide(win)
    pageHideHooks.add(onPageHide)
    win.addEventListener('pageshow', onPageShow)
  }

  ydoc.on('update', onDocUpdate)
  awareness.on('update', onAwarenessUpdate)
  awareness.on('change', reportPeers)

  channel.subscribe((status, err) => {
    if (destroyed) return
    ready = status === 'SUBSCRIBED'
    onStatus?.(status, err)
    if (!ready) return
    sendSync()
    sendAwareness([awareness.clientID])
  })

  return {
    awareness,
    origin,
    send,
    destroy() {
      if (destroyed) return
      pageHideHooks.delete(onPageHide)
      win?.removeEventListener('pageshow', onPageShow)
      ydoc.off('update', onDocUpdate)
      awareness.off('change', reportPeers)
      // Tell peers we're gone (handled by onAwarenessUpdate) before going silent.
      removeAwarenessStates(awareness, [awareness.clientID], 'destroy')
      awareness.off('update', onAwarenessUpdate)
      destroyed = true
      channel.unsubscribe()
    },
  }
}

// Topics still leaving. supabase-js returns the existing channel for a topic until its leave
// completes, so a quick rejoin (React Strict Mode, Back then reopen) would reuse a closing channel.
const leaving = new Map<string, Promise<unknown>>()

export function supabaseLiveChannel(client: SupabaseClient, docId: string): LiveChannel {
  const topic = `doc:${docId}`
  const handlers: [string, (payload: Record<string, unknown>) => void][] = []
  let ch: RealtimeChannel | null = null
  let closed = false
  return {
    send(event, payload) {
      void ch?.send({ type: 'broadcast', event, payload })
    },
    on(event, cb) {
      handlers.push([event, cb]) // attached when the channel is created in subscribe()
    },
    subscribe(cb) {
      // Private channels need the user's JWT on the join; without this the first join can go out
      // before supabase-js has loaded the session and gets rejected (then retried after a delay).
      const authed = client.realtime.setAuth().catch(() => undefined)
      void Promise.all([leaving.get(topic), authed]).then(() => {
        if (closed) return
        ch = client.channel(topic, { config: { private: true, broadcast: { self: false } } })
        for (const [event, h] of handlers) {
          ch.on('broadcast', { event }, (msg) => h((msg.payload ?? {}) as Record<string, unknown>))
        }
        ch.subscribe((status, err) => cb(status, err))
      })
    },
    unsubscribe() {
      closed = true
      if (!ch) return
      const p: Promise<unknown> = client
        .removeChannel(ch)
        .catch(() => undefined)
        .finally(() => {
          if (leaving.get(topic) === p) leaving.delete(topic)
        })
      leaving.set(topic, p)
      ch = null
    },
  }
}
