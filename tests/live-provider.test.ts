import { describe, it, expect, afterEach, vi } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { createLiveProvider, type LiveChannel } from '@/lib/live-provider'

type Handler = (payload: unknown) => void

// In-memory broadcast bus: each channel receives what the others send (broadcast self: false).
function createBus() {
  type Member = { handlers: Map<string, Handler[]>; joined: boolean; dropNext: number }
  const members = new Set<Member>()
  const sent: { event: string; payload: unknown }[] = []
  const all: Member[] = []
  let status: ((s: string, err?: Error) => void) | undefined
  function channel(): LiveChannel {
    const me: Member = { handlers: new Map<string, Handler[]>(), joined: false, dropNext: 0 }
    members.add(me)
    all.push(me)
    return {
      send(event, payload) {
        sent.push({ event, payload })
        for (const m of members) {
          if (m === me || !m.joined) continue
          if (event === 'update' && m.dropNext > 0) {
            m.dropNext--
            continue
          }
          for (const h of m.handlers.get(event) ?? []) h(JSON.parse(JSON.stringify(payload)))
        }
      },
      on(event, cb) {
        me.handlers.set(event, [...(me.handlers.get(event) ?? []), cb as Handler])
      },
      subscribe(cb) {
        me.joined = true
        status = cb
        cb('SUBSCRIBED')
      },
      unsubscribe() {
        me.joined = false
        members.delete(me)
      },
    }
  }
  /** Deliver a raw payload to member i (0-based join order). */
  const deliver = (i: number, event: string, payload: Record<string, unknown>) =>
    (all[i].handlers.get(event) ?? []).forEach((h) => h(payload))
  /** Drop the next n `update` messages addressed to member i. */
  const drop = (i: number, n: number) => (all[i].dropNext = n)
  /** Emit a status to the most recently subscribed channel. */
  const emitStatus = (s: string, err?: Error) => status?.(s, err)
  return { channel, sent, deliver, drop, emitStatus }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((f) => f())
})

function peer(bus: ReturnType<typeof createBus>, name: string, onPeers?: (n: string[]) => void) {
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  awareness.setLocalStateField('user', { name, color: '#f00' })
  const provider = createLiveProvider({ channel: bus.channel(), ydoc, awareness, onPeers })
  cleanups.push(() => {
    provider.destroy()
    awareness.destroy()
  })
  return { ydoc, awareness, provider, text: () => ydoc.getText('t').toString() }
}

describe('createLiveProvider', () => {
  it('relays edits from doc A to doc B both ways', () => {
    const bus = createBus()
    const a = peer(bus, 'Alice')
    const b = peer(bus, 'Bob')
    a.ydoc.getText('t').insert(0, 'hello')
    expect(b.text()).toBe('hello')
    b.ydoc.getText('t').insert(5, ' world')
    expect(a.text()).toBe('hello world')
  })

  it('sends base64 strings in update payloads', () => {
    const bus = createBus()
    const a = peer(bus, 'Alice')
    peer(bus, 'Bob')
    bus.sent.length = 0
    a.ydoc.getText('t').insert(0, 'x')
    const upd = bus.sent.find((s) => s.event === 'update')!
    expect(typeof (upd.payload as { u: string }).u).toBe('string')
  })

  it('a late joiner syncs full state via sync', () => {
    const bus = createBus()
    const a = peer(bus, 'Alice')
    const b = peer(bus, 'Bob')
    a.ydoc.getText('t').insert(0, 'abc')
    b.ydoc.getText('t').insert(3, 'def')
    const c = peer(bus, 'Carol')
    expect(c.text()).toBe('abcdef')
  })

  it('edits a joiner made before connecting reach existing peers', () => {
    const bus = createBus()
    const a = peer(bus, 'Alice')
    a.ydoc.getText('t').insert(0, 'abc')
    const ydoc = new Y.Doc()
    ydoc.getText('t').insert(0, 'zzz')
    const awareness = new Awareness(ydoc)
    const p = createLiveProvider({ channel: bus.channel(), ydoc, awareness })
    cleanups.push(() => (p.destroy(), awareness.destroy()))
    expect(a.text()).toBe(ydoc.getText('t').toString())
    expect(a.text()).toContain('zzz')
    expect(a.text()).toContain('abc')
  })

  it('reports other users names via onPeers, and drops them when they leave', () => {
    const bus = createBus()
    const seenByA: string[][] = []
    const seenByC: string[][] = []
    peer(bus, 'Alice', (n) => seenByA.push(n))
    const b = peer(bus, 'Bob')
    peer(bus, 'Carol', (n) => seenByC.push(n))
    expect(seenByA.at(-1)).toEqual(['Bob', 'Carol'])
    expect(seenByC.at(-1)).toEqual(['Alice', 'Bob'])
    b.provider.destroy()
    expect(seenByA.at(-1)).toEqual(['Carol'])
  })

  it('exposes awareness for CollaborationCaret', () => {
    const bus = createBus()
    const a = peer(bus, 'Alice')
    expect(a.provider.awareness).toBe(a.awareness)
  })

  it('sends nothing after destroy()', () => {
    const bus = createBus()
    const a = peer(bus, 'Alice')
    peer(bus, 'Bob')
    a.provider.destroy()
    const before = bus.sent.length
    a.ydoc.getText('t').insert(0, 'late')
    a.awareness.setLocalStateField('user', { name: 'Alice2', color: '#0f0' })
    expect(bus.sent.length).toBe(before)
  })

  it('self-heals after a dropped update by sending a fresh sync', () => {
    const bus = createBus()
    const a = peer(bus, 'Alice')
    const b = peer(bus, 'Bob')
    bus.drop(1, 1)
    a.ydoc.getText('t').insert(0, 'abc') // lost on the way to Bob
    a.ydoc.getText('t').insert(3, 'def') // depends on it: parked as pending, Bob asks for a sync
    expect(b.text()).toBe('abcdef')
    expect(b.ydoc.store.pendingStructs).toBeNull()
  })

  it('stops sending when the channel drops, passes the error through, resumes on resubscribe', () => {
    const bus = createBus()
    peer(bus, 'Alice')
    const seen: [string, Error | undefined][] = []
    const ydoc = new Y.Doc()
    const awareness = new Awareness(ydoc)
    const p = createLiveProvider({ channel: bus.channel(), ydoc, awareness, onStatus: (s, e) => seen.push([s, e]) })
    cleanups.push(() => (p.destroy(), awareness.destroy()))
    const err = new Error('denied')
    bus.emitStatus('CHANNEL_ERROR', err)
    expect(seen.at(-1)).toEqual(['CHANNEL_ERROR', err])
    const before = bus.sent.length
    ydoc.getText('t').insert(0, 'offline')
    p.send('title', { t: 'x' })
    expect(bus.sent.length).toBe(before)
    bus.emitStatus('SUBSCRIBED')
    expect(bus.sent.slice(before).map((s) => s.event)).toContain('sync')
  })

  it('ignores malformed payloads and keeps working', () => {
    const bus = createBus()
    const a = peer(bus, 'Alice')
    const b = peer(bus, 'Bob')
    expect(() => {
      bus.deliver(1, 'update', { u: '%%%not base64' })
      bus.deliver(1, 'update', { u: 'AAAAAAAA' })
      bus.deliver(1, 'sync', { sv: '%%%' })
      bus.deliver(1, 'awareness', { a: 'AQID' })
    }).not.toThrow()
    a.ydoc.getText('t').insert(0, 'still fine')
    expect(b.text()).toBe('still fine')
  })

  it('relays app events via send()', () => {
    const bus = createBus()
    const a = peer(bus, 'Alice')
    a.provider.send('title', { t: 'New title' })
    expect(bus.sent.at(-1)).toEqual({ event: 'title', payload: { t: 'New title' } })
  })

  it('drops the local caret on pagehide and restores it on a bfcache pageshow', () => {
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    try {
      const bus = createBus()
      const seenByA: string[][] = []
      peer(bus, 'Alice', (n) => seenByA.push(n))
      const b = peer(bus, 'Bob')
      expect(seenByA.at(-1)).toEqual(['Bob'])
      win.dispatchEvent(new Event('pagehide'))
      // Both peers share the stubbed window here; Bob's removal reaches Alice.
      expect(seenByA.at(-1)).toEqual([])
      expect(b.awareness.getLocalState()).toBeNull()
      win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
      expect(seenByA.at(-1)).toEqual(['Bob'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('throttles the self-heal sync to one per 1.5 s, with a trailing retry while still stuck', async () => {
    vi.useFakeTimers()
    try {
      const bus = createBus()
      const b = peer(bus, 'Bob')
      // Updates from a doc Bob never saw the start of: each one stays pending.
      const src = new Y.Doc()
      const ups: Uint8Array[] = []
      src.on('update', (u: Uint8Array) => ups.push(u))
      for (const ch of 'abcd') src.getText('t').insert(src.getText('t').length, ch)
      const syncs = () => bus.sent.filter((m) => m.event === 'sync').length
      const base = syncs()
      for (const u of ups.slice(1)) bus.deliver(0, 'update', { u: Buffer.from(u).toString('base64') })
      expect(b.ydoc.store.pendingStructs).not.toBeNull()
      expect(syncs() - base).toBe(1)
      await vi.advanceTimersByTimeAsync(1500)
      expect(syncs() - base).toBe(2) // trailing: still stuck, ask again
      Y.applyUpdate(b.ydoc, ups[0]) // gap filled
      await vi.advanceTimersByTimeAsync(5000)
      expect(syncs() - base).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses a caller-supplied origin for remote updates', () => {
    const bus = createBus()
    const origin = Symbol('mine')
    peer(bus, 'Alice')
    const ydoc = new Y.Doc()
    const awareness = new Awareness(ydoc)
    const p = createLiveProvider({ channel: bus.channel(), ydoc, awareness, origin })
    cleanups.push(() => (p.destroy(), awareness.destroy()))
    expect(p.origin).toBe(origin)
  })
})
