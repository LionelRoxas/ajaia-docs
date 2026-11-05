import { describe, it, expect, vi } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { createSaveQueue } from '@/lib/save-queue'
import type { Result } from '@/lib/types'

type Patch = { title?: string; content?: JSONContent }
type R = Result<{ version: number }>

// A fake `send` whose responses the test resolves by hand.
function controllableSend() {
  const calls: { patch: Patch; version: number; resolve: (r: R) => void; reject: (e: unknown) => void }[] = []
  const send = vi.fn((patch: Patch, version: number) => new Promise<R>((resolve, reject) => calls.push({ patch, version, resolve, reject })))
  return { send, calls }
}

const doc = (text: string): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createSaveQueue', () => {
  it('merges pushes made during an in-flight save into one request with the new version', async () => {
    const { send, calls } = controllableSend()
    const onStatus = vi.fn()
    const q = createSaveQueue({ initialVersion: 1, send, onStatus })

    q.push({ content: doc('a') })
    await tick()
    q.push({ content: doc('b'), title: 'T1' })
    q.push({ content: doc('c') })
    expect(send).toHaveBeenCalledTimes(1)
    expect(calls[0]).toMatchObject({ patch: { content: doc('a') }, version: 1 })

    calls[0].resolve({ ok: true, value: { version: 2 } })
    await tick()
    expect(send).toHaveBeenCalledTimes(2)
    expect(calls[1].patch).toEqual({ content: doc('c'), title: 'T1' })
    expect(calls[1].version).toBe(2)

    calls[1].resolve({ ok: true, value: { version: 3 } })
    await q.flush()
    expect(send).toHaveBeenCalledTimes(2)
    expect(onStatus).toHaveBeenCalledWith('saving')
    expect(onStatus).toHaveBeenLastCalledWith('saved')
  })

  it('stops sending forever after a conflict', async () => {
    const { send, calls } = controllableSend()
    const onStatus = vi.fn()
    const q = createSaveQueue({ initialVersion: 1, send, onStatus })

    q.push({ content: doc('a') })
    await tick()
    calls[0].resolve({ ok: false, error: 'conflict', message: 'changed' })
    await q.flush()
    expect(onStatus).toHaveBeenLastCalledWith('conflict', 'This document was changed by someone else. Reload to get the latest.')

    q.push({ content: doc('b') })
    q.push({ title: 'x' })
    await q.flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenLastCalledWith('conflict', 'This document was changed by someone else. Reload to get the latest.')
  })

  it('reports lost access on not_found', async () => {
    const { send, calls } = controllableSend()
    const onStatus = vi.fn()
    const q = createSaveQueue({ initialVersion: 1, send, onStatus })

    q.push({ content: doc('a') })
    await tick()
    calls[0].resolve({ ok: false, error: 'not_found', message: 'Document not found' })
    await q.flush()
    expect(onStatus).toHaveBeenLastCalledWith('error', 'You no longer have access to this document')
  })

  it('reports an expired session on unauthorized', async () => {
    const { send, calls } = controllableSend()
    const onStatus = vi.fn()
    const q = createSaveQueue({ initialVersion: 1, send, onStatus })

    q.push({ title: 'x' })
    await tick()
    calls[0].resolve({ ok: false, error: 'unauthorized', message: 'no session' })
    await q.flush()
    expect(onStatus).toHaveBeenLastCalledWith('error', 'Your session expired. Sign in again.')
  })

  it('shows the server message for invalid saves and keeps saving later edits', async () => {
    const { send, calls } = controllableSend()
    const onStatus = vi.fn()
    const q = createSaveQueue({ initialVersion: 4, send, onStatus })

    q.push({ content: doc('huge') })
    await tick()
    calls[0].resolve({ ok: false, error: 'invalid', message: 'Document is too large' })
    await q.flush()
    expect(onStatus).toHaveBeenLastCalledWith('error', 'Document is too large')

    q.push({ content: doc('small') })
    await tick()
    expect(calls[1]).toMatchObject({ patch: { content: doc('small') }, version: 4 })
    calls[1].resolve({ ok: true, value: { version: 5 } })
    await q.flush()
    expect(onStatus).toHaveBeenLastCalledWith('saved')
  })

  it('keeps the patch after a network failure and retries it with the next push', async () => {
    const { send, calls } = controllableSend()
    const onStatus = vi.fn()
    const q = createSaveQueue({ initialVersion: 1, send, onStatus })

    q.push({ title: 'Kept', content: doc('a') })
    await tick()
    calls[0].reject(new Error('offline'))
    await tick()
    expect(onStatus).toHaveBeenLastCalledWith('error', expect.any(String))

    q.push({ content: doc('b') })
    await tick()
    expect(calls[1]).toMatchObject({ patch: { title: 'Kept', content: doc('b') }, version: 1 })
  })

  it('flush() resends work kept after a network failure, with no new push', async () => {
    const { send, calls } = controllableSend()
    const onStatus = vi.fn()
    const q = createSaveQueue({ initialVersion: 3, send, onStatus })

    q.push({ title: 'Kept', content: doc('a') })
    await tick()
    calls[0].reject(new Error('offline'))
    await tick()
    expect(send).toHaveBeenCalledTimes(1)

    const flushed = q.flush()
    await tick()
    expect(send).toHaveBeenCalledTimes(2)
    expect(calls[1]).toMatchObject({ patch: { title: 'Kept', content: doc('a') }, version: 3 })
    calls[1].resolve({ ok: true, value: { version: 4 } })
    await flushed
    expect(onStatus).toHaveBeenLastCalledWith('saved')
  })

  it('starts a new request for a push that lands just as the previous run finishes', async () => {
    const { send, calls } = controllableSend()
    let first = true
    const q = createSaveQueue({
      initialVersion: 1,
      send,
      // Push from a microtask queued during the final status: after the loop exits, before any cleanup.
      onStatus: (s) => {
        if (s === 'saved' && first) {
          first = false
          queueMicrotask(() => q.push({ content: doc('late') }))
        }
      },
    })

    q.push({ content: doc('a') })
    await tick()
    calls[0].resolve({ ok: true, value: { version: 2 } })
    await tick()
    expect(send).toHaveBeenCalledTimes(2)
    expect(calls[1]).toMatchObject({ patch: { content: doc('late') }, version: 2 })
  })
})
