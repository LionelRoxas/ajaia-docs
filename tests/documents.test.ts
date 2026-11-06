import { describe, it, expect, beforeEach } from 'vitest'
import { memoryRepo } from '@/lib/repo.memory'
import type { Repo } from '@/lib/repo'
import type { DocRow, Profile } from '@/lib/types'
import { getDocumentFor, listDocumentsFor, createDocument, normalizeTitle } from '@/lib/documents'

const D1 = '00000000-0000-4000-8000-000000000001'
const MISSING = '00000000-0000-4000-8000-0000000000ff'
const alice: Profile = { id: 'a', email: 'alice@demo.test', name: 'Alice' }
const bob: Profile = { id: 'b', email: 'bob@demo.test', name: 'Bob' }
const carol: Profile = { id: 'c', email: 'carol@demo.test', name: 'Carol' }
const text = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
const welcome: DocRow = {
  id: D1, owner_id: 'a', title: 'Welcome', content: text("hi"), ydoc: null, version: 1, share_epoch: 0,
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

describe('normalizeTitle', () => {
  it('blank becomes default', () => {
    expect(normalizeTitle('   ')).toEqual({ ok: true, value: 'Untitled document' })
  })
  it('201 chars is invalid', () => {
    expect(normalizeTitle('x'.repeat(201))).toMatchObject({ ok: false, error: 'invalid' })
  })
})

describe('malformed ids', () => {
  it('getDocumentFor returns not_found', async () => {
    const r = await getDocumentFor(memoryRepo(), 'abc', 'a')
    expect(r).toMatchObject({ ok: false, error: 'not_found' })
  })
})
