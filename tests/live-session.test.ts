import { describe, it, expect, afterEach } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import type { LiveChannel } from '@/lib/live-provider'
import { createLiveSession } from '@/lib/live-session'
import type { Result } from '@/lib/types'

type Handler = (payload: Record<string, unknown>) => void
type Member = { topic: string; handlers: Map<string, Handler[]>; joined: boolean }

// Topic-aware in-memory broadcast bus; `allowed(user, topic)` plays the Realtime join policy.
function createBus(allowed: (user: string, topic: string) => boolean) {
  const members = new Set<Member>()
  function channel(user: string, topic: string): LiveChannel {
    const me: Member = { topic, handlers: new Map(), joined: false }
    return {
      send(event, payload) {
        for (const m of members) {
          if (m === me || !m.joined || m.topic !== topic) continue
          for (const h of m.handlers.get(event) ?? []) h(JSON.parse(JSON.stringify(payload)))
        }
      },
      on(event, cb) {
        me.handlers.set(event, [...(me.handlers.get(event) ?? []), cb])
      },
      subscribe(cb) {
        if (!allowed(user, topic)) return cb('CHANNEL_ERROR', new Error('Unauthorized'))
        me.joined = true
        members.add(me)
        cb('SUBSCRIBED')
      },
      unsubscribe() {
        me.joined = false
        members.delete(me)
      },
    }
  }
  return { channel }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function world() {
  const server = { epoch: 0, title: 'Welcome', members: new Set(['alice', 'bob', 'carol']) }
  const bus = createBus((user, topic) => server.members.has(user) && topic === `doc:D:${server.epoch}`)
  const cleanups: (() => void)[] = []
  function join(user: string, epoch = server.epoch) {
    const ydoc = new Y.Doc()
    const awareness = new Awareness(ydoc)
    awareness.setLocalStateField('user', { name: user, color: '#2453d6' })
    const lost: string[] = []
    const titles: string[] = []
    const peers: string[][] = []
    const session = createLiveSession({
      ydoc,
      awareness,
      epoch,
      channelFor: (e) => bus.channel(user, `doc:D:${e}`),
      fetchLive: async (): Promise<Result<{ epoch: number; title: string }>> =>
        server.members.has(user)
          ? { ok: true, value: { epoch: server.epoch, title: server.title } }
          : { ok: false, error: 'not_found', message: 'Document not found' },
      onLost: (r) => lost.push(r),
      onTitle: (t) => titles.push(t),
      onPeers: (n) => peers.push(n),
    })
    cleanups.push(() => (session.destroy(), awareness.destroy()))
    const text = () => ydoc.getText('t').toString()
    const type = (s: string) => ydoc.getText('t').insert(ydoc.getText('t').length, s)
    return { ydoc, awareness, session, lost, titles, peers, text, type }
  }
  return { server, join, cleanup: () => cleanups.splice(0).forEach((f) => f()) }
}

let w: ReturnType<typeof world>
afterEach(() => w?.cleanup())

describe('createLiveSession', () => {
  it('rekey after unshare: removed user is cut off both ways, the rest move to the new topic', async () => {
    w = world()
    const a = w.join('alice')
    const b = w.join('bob')
    const c = w.join('carol')
    a.type('hello')
    expect(b.text()).toBe('hello')
    expect(c.text()).toBe('hello')

    w.server.members.delete('bob')
    w.server.epoch = 1
    await a.session.rekey()
    await flush()

    expect(b.lost).toEqual(['no_access'])
    expect(a.session.epoch).toBe(1)
    expect(c.session.epoch).toBe(1)
    a.type(' world')
    expect(c.text()).toBe('hello world') // resynced on the new topic, no duplicated content
    expect(b.text()).toBe('hello')
    b.type(' (bob, revoked)')
    expect(a.text()).toBe('hello world')
    expect(c.text()).toBe('hello world')
  })

  it('a stale epoch at join (CHANNEL_ERROR) refetches the epoch and rejoins', async () => {
    w = world()
    const a = w.join('alice')
    a.type('state')
    w.server.epoch = 1
    await a.session.rekey() // alice moves to epoch 1
    const late = w.join('carol', 0) // page rendered before the bump
    await flush()
    expect(late.session.epoch).toBe(1)
    expect(late.text()).toBe('state')
    expect(late.lost).toEqual([])
  })

  it('treats a title broadcast as a hint and reports the server title', async () => {
    w = world()
    const a = w.join('alice')
    const b = w.join('bob')
    w.server.title = 'Real title'
    a.session.send('title', { t: '<script>evil</script>' })
    await flush()
    expect(b.titles).toEqual(['Real title'])
  })

  it('on rejoin keeps the local caret state and drops peers from the old topic', async () => {
    w = world()
    const a = w.join('alice')
    w.join('bob')
    expect(a.peers.at(-1)).toEqual(['bob'])
    w.server.members.delete('bob')
    w.server.epoch = 1
    await a.session.rekey()
    await flush()
    expect(a.peers.at(-1)).toEqual([])
    expect(a.awareness.getLocalState()).toMatchObject({ user: { name: 'alice' } })
    expect([...a.awareness.getStates().keys()]).toEqual([a.awareness.clientID])
  })

  it('rejoins when a save reports a newer epoch (no rekey received)', async () => {
    w = world()
    const a = w.join('alice')
    const c = w.join('carol')
    w.server.members.delete('bob')
    w.server.epoch = 1 // unshared from elsewhere; nobody broadcast rekey
    a.session.noteEpoch(1)
    c.session.noteEpoch(1)
    expect(a.session.epoch).toBe(1)
    a.type('after')
    expect(c.text()).toBe('after')
    a.session.noteEpoch(0) // stale report: ignored
    expect(a.session.epoch).toBe(1)
  })

  it('keeps one origin across rejoins', async () => {
    w = world()
    const a = w.join('alice')
    const before = a.session.origin
    w.server.epoch = 1
    await a.session.rekey()
    expect(a.session.origin).toBe(before)
  })
})
