import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { memoryRepo } from '@/lib/repo.memory'
import type { Repo } from '@/lib/repo'
import type { DocRow, Profile } from '@/lib/types'
import { openLiveDocument, saveLiveUpdate, saveTitle } from '@/lib/live'
import { fromB64, toB64 } from '@/lib/ydoc'

const D1 = '00000000-0000-4000-8000-000000000001'
const alice: Profile = { id: 'a', email: 'alice@demo.test', name: 'Alice' }
const bob: Profile = { id: 'b', email: 'bob@demo.test', name: 'Bob' }
const carol: Profile = { id: 'c', email: 'carol@demo.test', name: 'Carol' }
const text = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
const welcome: DocRow = {
  id: D1, owner_id: 'a', title: 'Welcome', content: text('hi'), ydoc: null, version: 1,
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
    expect(s).toContain('AAA')
    expect(s).toContain('BBB')
    expect(s).toContain('hi')
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
})
