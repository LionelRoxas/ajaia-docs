import type { JSONContent } from '@tiptap/core'
import type { Result } from './types'

export type Status = 'idle' | 'saving' | 'saved' | 'conflict' | 'error'
export type Patch = { title?: string; content?: JSONContent }

export type SaveQueue = { push(patch: Patch): void; flush(): Promise<void> }

export const CONFLICT_MESSAGE = 'This document was changed by someone else. Reload to get the latest.'
export const NO_ACCESS_MESSAGE = 'You no longer have access to this document'
export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Sign in again.'
const NETWORK = "Couldn't save. Check your connection."

// Later fields win; fields absent from `next` keep their earlier value.
const merge = (prev: Patch | null, next: Patch): Patch => ({ ...prev, ...next })

/**
 * Serializes saves: one request in flight, edits made meanwhile merge into the next request,
 * which uses the version returned by the previous save. A conflict or lost access stops it for good.
 */
export function createSaveQueue(opts: {
  initialVersion: number
  send: (patch: Patch, version: number) => Promise<Result<{ version: number }>>
  onStatus: (s: Status, message?: string) => void
}): SaveQueue {
  let version = opts.initialVersion
  let pending: Patch | null = null
  let running: Promise<void> | null = null
  let stopped = false

  async function run() {
    while (pending && !stopped) {
      const patch = pending
      pending = null
      let res: Result<{ version: number }>
      try {
        res = await opts.send(patch, version)
      } catch {
        pending = merge(patch, pending ?? {}) // keep unsent work; the next push retries it
        opts.onStatus('error', NETWORK)
        return
      }
      if (res.ok) {
        version = res.value.version
        if (!pending) opts.onStatus('saved')
        continue
      }
      if (res.error === 'conflict') {
        stopped = true
        opts.onStatus('conflict', CONFLICT_MESSAGE)
      } else if (res.error === 'not_found' || res.error === 'unauthorized' || res.error === 'forbidden') {
        stopped = true
        opts.onStatus('error', res.error === 'unauthorized' ? SESSION_EXPIRED_MESSAGE : NO_ACCESS_MESSAGE)
      } else {
        // invalid (e.g. too large): drop this patch, surface the reason; later edits still save.
        opts.onStatus('error', res.message)
        if (pending) opts.onStatus('saving')
        else return
      }
    }
  }

  function start() {
    running ??= run().finally(() => {
      running = null
    })
  }

  return {
    push(patch) {
      if (stopped) return
      pending = merge(pending, patch)
      opts.onStatus('saving')
      start()
    },
    async flush() {
      while (running) await running
    },
  }
}
