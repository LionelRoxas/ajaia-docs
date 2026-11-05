import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as Y from 'yjs'
import { createLiveSaver, NO_ACCESS_MESSAGE, SESSION_EXPIRED_MESSAGE, type Status } from '@/lib/live-save'
import { fromB64 } from '@/lib/ydoc'
import type { Result } from '@/lib/types'

const REMOTE = Symbol('remote')
type Res = Result<{ version: number }>

function setup(results: (Res | Error)[] = []) {
  const ydoc = new Y.Doc()
  const server = new Y.Doc() // what the server stored
  const statuses: [Status, string?][] = []
  const sent: string[] = []
  const send = vi.fn(async (u: string) => {
    sent.push(u)
    const r = results.shift() ?? { ok: true as const, value: { version: sent.length + 1 } }
    if (r instanceof Error) throw r
    if (r.ok) Y.applyUpdate(server, fromB64(u))
    return r
  })
  const saver = createLiveSaver({
    ydoc,
    isRemote: (o) => o === REMOTE,
    send,
    onStatus: (s, m) => statuses.push(m === undefined ? [s] : [s, m]),
    retryMs: () => 5000,
  })
  const type = (t: string) => ydoc.getText('t').insert(ydoc.getText('t').length, t)
  const serverText = () => server.getText('t').toString()
  return { ydoc, server, statuses, sent, send, saver, type, serverText }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createLiveSaver', () => {
  it('saves 1 s after the last local edit, as one request', async () => {
    const s = setup()
    s.type('a')
    await vi.advanceTimersByTimeAsync(600)
    s.type('b')
    await vi.advanceTimersByTimeAsync(600)
    expect(s.send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(s.send).toHaveBeenCalledTimes(1)
    expect(s.serverText()).toBe('ab')
    expect(s.statuses.at(-1)).toEqual(['saved'])
    expect(s.saver.hasUnsaved()).toBe(false)
  })

  it('only sends what the server does not have yet', async () => {
    const s = setup()
    s.type('hello')
    await s.saver.flush()
    s.type('!')
    await s.saver.flush()
    expect(s.send).toHaveBeenCalledTimes(2)
    const second = new Y.Doc()
    Y.applyUpdate(second, fromB64(s.sent[1]))
    expect(second.store.pendingStructs).not.toBeNull() // depends on the first save: a diff, not the full doc
    expect(s.serverText()).toBe('hello!')
  })

  it('does not save remote updates on their own, but includes them in its next save', async () => {
    const s = setup()
    const peer = new Y.Doc()
    peer.getText('t').insert(0, 'peer ')
    Y.applyUpdate(s.ydoc, Y.encodeStateAsUpdate(peer), REMOTE)
    await vi.advanceTimersByTimeAsync(5000)
    expect(s.send).not.toHaveBeenCalled()
    s.type('me')
    await s.saver.flush()
    expect(s.serverText()).toBe('peer me')
  })

  it('keeps edits after a network failure and retries them with later ones', async () => {
    const s = setup([new Error('offline')])
    s.type('one')
    await s.saver.flush()
    expect(s.statuses.at(-1)).toEqual(['error', "Couldn't save. Check your connection."])
    expect(s.saver.hasUnsaved()).toBe(true)
    s.type(' two')
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.serverText()).toBe('one two')
    expect(s.statuses.at(-1)).toEqual(['saved'])
  })

  it('retries on its own after invalid or conflict results', async () => {
    const s = setup([
      { ok: false, error: 'invalid', message: 'Malformed update' },
      { ok: false, error: 'conflict', message: 'Could not save right now. Try again.' },
    ])
    s.type('x')
    await s.saver.flush()
    expect(s.statuses.at(-1)).toEqual(['error', 'Malformed update'])
    await vi.advanceTimersByTimeAsync(5000)
    expect(s.statuses.at(-1)).toEqual(['error', 'Could not save right now. Try again.'])
    await vi.advanceTimersByTimeAsync(5000)
    expect(s.serverText()).toBe('x')
    expect(s.statuses.at(-1)).toEqual(['saved'])
  })

  it('stops for good on lost access', async () => {
    const s = setup([{ ok: false, error: 'not_found', message: 'Document not found' }])
    s.type('x')
    await s.saver.flush()
    expect(s.statuses.at(-1)).toEqual(['error', NO_ACCESS_MESSAGE])
    s.type('y')
    await vi.advanceTimersByTimeAsync(30000)
    await s.saver.flush()
    expect(s.send).toHaveBeenCalledTimes(1)
  })

  it('stops for good on an expired session', async () => {
    const s = setup([{ ok: false, error: 'unauthorized', message: 'x' }])
    s.type('x')
    await s.saver.flush()
    expect(s.statuses.at(-1)).toEqual(['error', SESSION_EXPIRED_MESSAGE])
  })

  it('flush() also sends edits made while a request was in flight', async () => {
    const s = setup()
    s.type('a')
    const first = s.saver.flush()
    s.type('b') // arrives during the request
    await first
    await s.saver.flush()
    expect(s.serverText()).toBe('ab')
    expect(s.saver.hasUnsaved()).toBe(false)
  })

  it('stays on Saving while newer edits wait for their debounce', async () => {
    let release!: () => void
    const s = setup()
    s.send.mockImplementationOnce(async (u: string) => {
      await new Promise<void>((r) => (release = r))
      Y.applyUpdate(s.server, fromB64(u))
      return { ok: true, value: { version: 2 } }
    })
    s.type('a')
    await vi.advanceTimersByTimeAsync(1000)
    s.type('b')
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.statuses.at(-1)).toEqual(['saving'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.serverText()).toBe('ab')
    expect(s.statuses.at(-1)).toEqual(['saved'])
  })

  it('sends nothing after destroy() except an explicit flush', async () => {
    const s = setup()
    s.type('a')
    s.saver.destroy()
    await vi.advanceTimersByTimeAsync(5000)
    expect(s.send).not.toHaveBeenCalled()
    await s.saver.flush() // unmount flushes explicitly
    expect(s.serverText()).toBe('a')
  })
})
