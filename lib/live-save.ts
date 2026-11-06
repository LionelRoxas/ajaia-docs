import * as Y from 'yjs'
import { YDOC_MAX_BYTES } from './limits'
import type { Result } from './types'
import { toB64 } from './ydoc'

export type Status = 'idle' | 'saving' | 'saved' | 'error'

export const NO_ACCESS_MESSAGE = 'You no longer have access to this document'
export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Sign in again.'
const NETWORK = "Couldn't save. Check your connection."
const TOO_BIG = 'Document is too large'

export type LiveSaver = {
  /** Send unsaved local edits now (debounce, Back link, unmount); resolves once idle. */
  flush(): Promise<void>
  /** Local edits not yet confirmed by the server. */
  hasUnsaved(): boolean
  /** Stops listening and cancels timers; an in-flight request still completes. */
  destroy(): void
  /** Access is gone: drop pending work for good (no more requests, nothing reported unsaved). */
  stop(): void
}

/**
 * Saves the ydoc ~debounceMs after local edits stop. Each request carries everything since the
 * last confirmed save (a diff against that state vector), so it never depends on state the server
 * lacks, and a failed request loses nothing: the next one simply covers more. Remote updates
 * don't trigger saves (their author saves them) but ride along when we do.
 * Lost access or an expired session stops it for good; any other failure retries with backoff.
 */
export function createLiveSaver(opts: {
  ydoc: Y.Doc
  isRemote: (origin: unknown) => boolean
  send: (update: string) => Promise<Result<{ version: number }>>
  onStatus: (s: Status, message?: string) => void
  debounceMs?: number
  retryMs?: (attempt: number) => number
}): LiveSaver {
  const { ydoc, isRemote, send, onStatus } = opts
  const debounceMs = opts.debounceMs ?? 1000
  const retryMs = opts.retryMs ?? ((n: number) => Math.min(2000 * 2 ** n, 15000))
  let confirmed = Y.encodeStateVector(ydoc) // what the server is known to have
  let dirty = false // local edits since `confirmed`
  let busy = false
  let done: Promise<boolean> = Promise.resolve(true)
  let stopped = false
  let destroyed = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer)
    timer = destroyed ? null : setTimeout(() => void flush(false), ms)
  }

  const onUpdate = (_u: Uint8Array, origin: unknown) => {
    if (stopped || isRemote(origin)) return
    dirty = true
    onStatus('saving')
    schedule(debounceMs)
  }
  ydoc.on('update', onUpdate)

  // One request covering everything since `confirmed`. Resolves true on success.
  async function sendOnce(): Promise<boolean> {
    busy = true
    try {
      dirty = false
      const sv = Y.encodeStateVector(ydoc)
      const update = Y.encodeStateAsUpdate(ydoc, confirmed)
      let res: Result<{ version: number }>
      if (update.length > YDOC_MAX_BYTES) {
        res = { ok: false, error: 'invalid', message: TOO_BIG } // never reaches the request body limit
      } else {
        try {
          res = await send(toB64(update))
        } catch {
          res = { ok: false, error: 'invalid', message: NETWORK }
        }
      }
      if (res.ok) {
        confirmed = sv
        failures = 0
        if (!dirty) onStatus('saved') // else newer edits are waiting: stay on "Saving…"
        return true
      }
      if (res.error === 'not_found' || res.error === 'forbidden' || res.error === 'unauthorized') {
        stopped = true
        onStatus('error', res.error === 'unauthorized' ? SESSION_EXPIRED_MESSAGE : NO_ACCESS_MESSAGE)
        return false
      }
      // Keep everything (`confirmed` is unchanged) and try again later.
      dirty = true
      onStatus('error', res.message)
      schedule(retryMs(failures++))
      return false
    } finally {
      busy = false
    }
  }

  // all: keep going until nothing is left (Back link, unmount); otherwise one request (debounce, retry).
  async function flush(all: boolean): Promise<void> {
    if (timer) clearTimeout(timer)
    timer = null
    for (;;) {
      while (busy) await done
      if (!dirty || stopped) return
      done = sendOnce()
      if (!(await done) || !all) return
    }
  }

  const saver: LiveSaver = {
    flush: () => flush(true),
    hasUnsaved: () => !stopped && (dirty || busy),
    destroy() {
      destroyed = true
      if (timer) clearTimeout(timer)
      timer = null
      ydoc.off('update', onUpdate)
    },
    stop() {
      stopped = true
      saver.destroy()
    },
  }
  return saver
}
