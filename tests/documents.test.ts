import { describe, it, expect, beforeEach } from 'vitest'
import { memoryRepo } from '@/lib/repo.memory'
import type { Repo } from '@/lib/repo'
import type { DocRow, Profile } from '@/lib/types'
import { getDocumentFor, listDocumentsFor, saveDocument, createDocument } from '@/lib/documents'

const D1 = '00000000-0000-4000-8000-000000000001'
const MISSING = '00000000-0000-4000-8000-0000000000ff'
const alice: Profile = { id: 'a', email: 'alice@demo.test', name: 'Alice' }
const bob: Profile = { id: 'b', email: 'bob@demo.test', name: 'Bob' }
const carol: Profile = { id: 'c', email: 'carol@demo.test', name: 'Carol' }
const text = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
const welcome: DocRow = {
  id: D1, owner_id: 'a', title: 'Welcome', content: text('hi'), version: 1,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

let repo: Repo
beforeEach(() => {
  repo = memoryRepo({ profiles: [alice, bob, carol], docs: [{ ...welcome }], shares: [[D1, 'b']] })
})

describe('documents', () => {
  it('stranger gets not_found', async () => {
    const r = await getDocumentFor(repo, D1, 'c')
    expect(r).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('missing doc gets not_found', async () => {
    expect(await getDocumentFor(repo, MISSING, 'a')).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('owner and editor roles with owner name', async () => {
    const o = await getDocumentFor(repo, D1, 'a')
    const e = await getDocumentFor(repo, D1, 'b')
    expect(o.ok && o.value.role).toBe('owner')
    expect(e.ok && e.value.role).toBe('editor')
    expect(e.ok && e.value.ownerName).toBe('Alice')
  })
  it('editor saves with current version', async () => {
    const r = await saveDocument(repo, 'b', { id: D1, version: 1, content: text('x') })
    expect(r).toEqual({ ok: true, value: { version: 2 } })
  })
  it('second save on stale version conflicts, first content kept', async () => {
    const first = await saveDocument(repo, 'a', { id: D1, version: 1, content: text('first') })
    const second = await saveDocument(repo, 'b', { id: D1, version: 1, content: text('second') })
    expect(first.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, error: 'conflict' })
    expect((await repo.getDocument(D1))!.content).toEqual(text('first'))
  })
  it('removed share gets not_found on save', async () => {
    await repo.removeShare(D1, 'b')
    const r = await saveDocument(repo, 'b', { id: D1, version: 1, content: text('x') })
    expect(r).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('blank title becomes default', async () => {
    await saveDocument(repo, 'a', { id: D1, version: 1, title: '   ' })
    expect((await repo.getDocument(D1))!.title).toBe('Untitled document')
  })
  it('201-char title is invalid', async () => {
    const r = await saveDocument(repo, 'a', { id: D1, version: 1, title: 'x'.repeat(201) })
    expect(r).toMatchObject({ ok: false, error: 'invalid' })
  })
  it('oversize content is invalid and version unchanged', async () => {
    const overhead = new TextEncoder().encode(JSON.stringify(text(''))).length
    const big = text('x'.repeat(1_000_001 - overhead))
    expect(new TextEncoder().encode(JSON.stringify(big)).length).toBe(1_000_001)
    const r = await saveDocument(repo, 'a', { id: D1, version: 1, content: big })
    expect(r).toMatchObject({ ok: false, error: 'invalid' })
    expect((await repo.getDocument(D1))!.version).toBe(1)
  })
  it('lists shared with owner name', async () => {
    const l = await listDocumentsFor(repo, 'b')
    expect(l.owned).toEqual([])
    expect(l.shared).toHaveLength(1)
    expect(l.shared[0]).toMatchObject({ title: 'Welcome', owner_name: 'Alice' })
  })
  it('createDocument defaults title', async () => {
    const r = await createDocument(repo, 'a')
    expect(r.ok && r.value.title).toBe('Untitled document')
    expect((await listDocumentsFor(repo, 'a')).owned).toHaveLength(2)
  })
})

describe('malformed ids', () => {
  it('getDocumentFor returns not_found', async () => {
    const r = await getDocumentFor(memoryRepo(), 'abc', 'a')
    expect(r).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('saveDocument returns not_found', async () => {
    const r = await saveDocument(memoryRepo(), 'a', { id: 'abc', version: 1, title: 'x' })
    expect(r).toMatchObject({ ok: false, error: 'not_found' })
  })
})
