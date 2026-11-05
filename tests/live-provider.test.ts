import { describe, it, expect, afterEach } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { createLiveProvider, type LiveChannel } from '@/lib/live-provider'

type Handler = (payload: unknown) => void

// In-memory broadcast bus: each channel receives what the others send (broadcast self: false).
function createBus() {
  const members = new Set<{ handlers: Map<string, Handler[]>; joined: boolean }>()
  const sent: { event: string; payload: unknown }[] = []
  function channel(): LiveChannel {
    const me = { handlers: new Map<string, Handler[]>(), joined: false }
    members.add(me)
    return {
      send(event, payload) {
        sent.push({ event, payload })
        for (const m of members) {
          if (m === me || !m.joined) continue
          for (const h of m.handlers.get(event) ?? []) h(JSON.parse(JSON.stringify(payload)))
        }
      },
      on(event, cb) {
        me.handlers.set(event, [...(me.handlers.get(event) ?? []), cb as Handler])
      },
      subscribe(cb) {
        me.joined = true
        cb('SUBSCRIBED')
      },
      unsubscribe() {
        me.joined = false
        members.delete(me)
      },
    }
  }
  return { channel, sent }
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
})
