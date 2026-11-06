import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { memoryRepo } from '@/lib/repo.memory'
import type { Repo } from '@/lib/repo'
import type { DocRow, Profile } from '@/lib/types'
import { openLiveDocument, saveLiveUpdate, saveTitle } from '@/lib/live'
import { fromB64, jsonToYState, toB64 } from '@/lib/ydoc'

const D1 = '00000000-0000-4000-8000-000000000001'
const alice: Profile = { id: 'a', email: 'alice@demo.test', name: 'Alice' }
const bob: Profile = { id: 'b', email: 'bob@demo.test', name: 'Bob' }
const carol: Profile = { id: 'c', email: 'carol@demo.test', name: 'Carol' }
const text = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
const welcome: DocRow = {
  id: D1, owner_id: 'a', title: 'Welcome', content: text('hi'), ydoc: null, version: 1, share_epoch: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

function addParagraph(state: Uint8Array, t: string): string {
  const d = new Y.Doc()
  Y.applyUpdate(d, state)
  let update!: Uint8Array
  d.on('update', (u: Uint8Array) => { update = u })
  const frag = d.getXmlFragment('default')
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(t)])
  frag.insert(frag.length, [p])
  return toB64(update)
}

let repo: Repo
beforeEach(() => {
  repo = memoryRepo({ profiles: [alice, bob, carol], docs: [{ ...welcome }], shares: [[D1, 'b']] })
})

describe('live', () => {
  it('stranger gets not_found', async () => {
    expect(await openLiveDocument(repo, D1, 'c')).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('first open sets ydoc, second returns same', async () => {
    const a = await openLiveDocument(repo, D1, 'a')
    const b = await openLiveDocument(repo, D1, 'b')
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) {
      expect(a.value.ydoc).toBeTruthy()
      expect(b.value.ydoc).toBe(a.value.ydoc)
      expect(b.value.ownerName).toBe('Alice')
    }
  })
  it('two clients from the same base both land', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    const base = fromB64(o.value.ydoc)
    expect(await saveLiveUpdate(repo, 'a', { id: D1, update: addParagraph(base, 'AAA') })).toMatchObject({ ok: true })
    expect(await saveLiveUpdate(repo, 'b', { id: D1, update: addParagraph(base, 'BBB') })).toMatchObject({ ok: true })
    const s = JSON.stringify((await repo.getDocument(D1))!.content)
    expect(s.match(/AAA/g)).toHaveLength(1)
    expect(s.match(/BBB/g)).toHaveLength(1)
    expect(s.match(/hi/g)).toHaveLength(1)
  })
  it('a save reports the current share epoch', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    expect(await saveLiveUpdate(repo, 'a', { id: D1, update: addParagraph(fromB64(o.value.ydoc), 'x') })).toMatchObject({
      ok: true,
      value: { epoch: 0 },
    })
    await repo.bumpShareEpoch(D1)
    expect(await saveLiveUpdate(repo, 'a', { id: D1, update: addParagraph(fromB64(o.value.ydoc), 'y') })).toMatchObject({
      ok: true,
      value: { epoch: 1 },
    })
  })
  it('stranger cannot save', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    expect(await saveLiveUpdate(repo, 'c', { id: D1, update: addParagraph(fromB64(o.value.ydoc), 'x') })).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('retries when updateIfVersion loses a race once', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    let fails = 1
    const flaky: Repo = { ...repo, updateIfVersion: (...a) => (fails-- > 0 ? Promise.resolve(null) : repo.updateIfVersion(...a)) }
    expect(await saveLiveUpdate(flaky, 'a', { id: D1, update: addParagraph(fromB64(o.value.ydoc), 'AAA') })).toMatchObject({ ok: true })
  })
  it('conflict after 3 failed retries', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    const bad: Repo = { ...repo, updateIfVersion: () => Promise.resolve(null) }
    expect(await saveLiveUpdate(bad, 'a', { id: D1, update: addParagraph(fromB64(o.value.ydoc), 'AAA') })).toMatchObject({ ok: false, error: 'conflict' })
  })
  it('oversize merged content is invalid', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    const r = await saveLiveUpdate(repo, 'a', { id: D1, update: addParagraph(fromB64(o.value.ydoc), 'x'.repeat(1_000_001)) })
    expect(r).toMatchObject({ ok: false, error: 'invalid' })
  })
  it('saveTitle blank becomes default and bumps version', async () => {
    const r = await saveTitle(repo, 'b', { id: D1, title: '   ' })
    expect(r).toEqual({ ok: true, value: { title: 'Untitled document' } })
    expect((await repo.getDocument(D1))!.version).toBe(2)
  })
  it('saveTitle stranger not_found', async () => {
    expect(await saveTitle(repo, 'c', { id: D1, title: 'x' })).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('malformed update is invalid', async () => {
    await openLiveDocument(repo, D1, 'a')
    expect(await saveLiveUpdate(repo, 'a', { id: D1, update: '////////' })).toMatchObject({ ok: false, error: 'invalid' })
    expect(await saveLiveUpdate(repo, 'a', { id: D1, update: '!!!not base64' })).toMatchObject({ ok: false, error: 'invalid' })
  })
  it('re-sending the same update is idempotent', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    const u = addParagraph(fromB64(o.value.ydoc), 'AAA')
    await saveLiveUpdate(repo, 'a', { id: D1, update: u })
    const once = JSON.stringify((await repo.getDocument(D1))!.content)
    expect(await saveLiveUpdate(repo, 'a', { id: D1, update: u })).toMatchObject({ ok: true })
    expect(JSON.stringify((await repo.getDocument(D1))!.content)).toBe(once)
  })
  it('setYdocIfNull race loser re-reads the winner', async () => {
    const winner = toB64(jsonToYState(text('winner')))
    const racy: Repo = {
      ...repo,
      setYdocIfNull: async (id) => {
        await repo.setYdocIfNull(id, winner)
        return null
      },
    }
    const r = await openLiveDocument(racy, D1, 'a')
    expect(r.ok && r.value.ydoc).toBe(winner)
  })
  it('save before the doc has a ydoc is a conflict', async () => {
    const base = jsonToYState(text('hi'))
    expect(await saveLiveUpdate(repo, 'a', { id: D1, update: addParagraph(base, 'AAA') })).toMatchObject({ ok: false, error: 'conflict' })
  })
  it('compacts: deleted text is not retained', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    const client = new Y.Doc()
    Y.applyUpdate(client, fromB64(o.value.ydoc))
    const frag = client.getXmlFragment('default')
    for (let i = 0; i < 5; i++) {
      let up!: Uint8Array
      const grab = (u: Uint8Array) => { up = u }
      client.on('update', grab)
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText('SECRETSECRET'.repeat(8000))])
      frag.insert(frag.length, [p])
      expect(await saveLiveUpdate(repo, 'a', { id: D1, update: toB64(up) })).toMatchObject({ ok: true })
      frag.delete(frag.length - 1, 1)
      expect(await saveLiveUpdate(repo, 'a', { id: D1, update: toB64(up) })).toMatchObject({ ok: true })
      client.off('update', grab)
    }
    const stored = (await repo.getDocument(D1))!.ydoc!
    expect(stored.length).toBeLessThan(10_000)
    expect(Buffer.from(stored, 'base64').toString('latin1')).not.toContain('SECRETSECRET')
  })
  it('update writing to a non-default root is invalid', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    const d = new Y.Doc()
    Y.applyUpdate(d, fromB64(o.value.ydoc))
    let up!: Uint8Array
    d.on('update', (u: Uint8Array) => { up = u })
    d.getMap('x').set('k', 'v')
    expect(await saveLiveUpdate(repo, 'a', { id: D1, update: toB64(up) })).toMatchObject({ ok: false, error: 'invalid' })
  })
  it('oversize incoming update is invalid', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    const r = await saveLiveUpdate(repo, 'a', { id: D1, update: addParagraph(fromB64(o.value.ydoc), 'x'.repeat(2_100_000)) })
    expect(r).toMatchObject({ ok: false, error: 'invalid' })
  })
  it('update with a missing dependency is invalid and leaves state unchanged', async () => {
    const o = await openLiveDocument(repo, D1, 'a')
    if (!o.ok) throw new Error('open')
    const client = new Y.Doc()
    Y.applyUpdate(client, fromB64(o.value.ydoc))
    const frag = client.getXmlFragment('default')
    const add = (t: string) => {
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText(t)])
      frag.insert(frag.length, [p])
    }
    add('one') // never saved
    const sv = Y.encodeStateVector(client)
    add('two')
    const delta = toB64(Y.encodeStateAsUpdate(client, sv))
    const before = await repo.getDocument(D1)
    expect(await saveLiveUpdate(repo, 'a', { id: D1, update: delta })).toMatchObject({ ok: false, error: 'invalid' })
    const after = await repo.getDocument(D1)
    expect(after!.ydoc).toBe(before!.ydoc)
    expect(after!.version).toBe(before!.version)
  })
})
