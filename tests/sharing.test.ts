import { describe, it, expect, beforeEach } from 'vitest'
import { memoryRepo } from '@/lib/repo.memory'
import type { Repo } from '@/lib/repo'
import type { DocRow, Profile } from '@/lib/types'
import { getDocumentFor } from '@/lib/documents'
import { shareDocument, unshareDocument, listSharesFor } from '@/lib/sharing'

const D1 = '00000000-0000-4000-8000-000000000001'
const MISSING = '00000000-0000-4000-8000-0000000000ff'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const alice: Profile = { id: 'a', email: 'alice@demo.test', name: 'Alice' }
const bob: Profile = { id: 'b', email: 'bob@demo.test', name: 'Bob' }
const carol: Profile = { id: 'c', email: 'carol@demo.test', name: 'Carol' }
const welcome: DocRow = {
  id: D1, owner_id: 'a', title: 'Welcome', content: { type: 'doc', content: [{ type: 'paragraph' }] }, ydoc: null, version: 1, share_epoch: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const seed = () => ({ profiles: [alice, bob, carol], docs: [{ ...welcome }], shares: [[D1, 'b']] as [string, string][] })

let repo: Repo
beforeEach(() => { repo = memoryRepo(seed()) })

describe('sharing', () => {
  it('owner shares by messy email; recipient can then open', async () => {
    const r = await shareDocument(repo, 'a', D1, '  Carol@Demo.TEST ')
    expect(r).toEqual({ ok: true, value: carol })
    const g = await getDocumentFor(repo, D1, 'c')
    expect(g.ok && g.value.role).toBe('editor')
  })
  it('editor cannot share', async () => {
    expect(await shareDocument(repo, 'b', D1, 'carol@demo.test')).toEqual({
      ok: false, error: 'forbidden', message: 'Only the owner can share this document',
    })
  })
  it('stranger and missing doc get not_found', async () => {
    expect(await shareDocument(repo, 'c', D1, 'bob@demo.test')).toMatchObject({ ok: false, error: 'not_found' })
    expect(await shareDocument(repo, 'a', MISSING, 'bob@demo.test')).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('unknown email is invalid', async () => {
    expect(await shareDocument(repo, 'a', D1, 'nobody@demo.test')).toEqual({ ok: false, error: 'invalid', message: 'No user with that email' })
  })
  it('self share is invalid', async () => {
    expect(await shareDocument(repo, 'a', D1, 'ALICE@demo.test')).toEqual({ ok: false, error: 'invalid', message: 'You already own this document' })
  })
  it('duplicate share is invalid', async () => {
    expect(await shareDocument(repo, 'a', D1, 'bob@demo.test')).toEqual({ ok: false, error: 'invalid', message: 'Already shared with this user' })
  })
  it('unshare removes access', async () => {
    expect(await unshareDocument(repo, 'a', D1, 'b')).toEqual({ ok: true, value: null })
    expect(await getDocumentFor(repo, D1, 'b')).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('unshare bumps share_epoch; share does not', async () => {
    await shareDocument(repo, 'a', D1, 'carol@demo.test')
    expect((await repo.getDocument(D1))!.share_epoch).toBe(0)
    await unshareDocument(repo, 'a', D1, 'b')
    expect((await repo.getDocument(D1))!.share_epoch).toBe(1)
    await unshareDocument(repo, 'a', D1, 'c')
    expect((await repo.getDocument(D1))!.share_epoch).toBe(2)
  })
  it('failed unshare does not bump share_epoch', async () => {
    await unshareDocument(repo, 'b', D1, 'b')
    expect((await repo.getDocument(D1))!.share_epoch).toBe(0)
  })
  it('editor cannot unshare or list; stranger gets not_found', async () => {
    expect(await unshareDocument(repo, 'b', D1, 'b')).toMatchObject({ ok: false, error: 'forbidden' })
    expect(await listSharesFor(repo, 'b', D1)).toMatchObject({ ok: false, error: 'forbidden' })
    expect(await unshareDocument(repo, 'c', D1, 'b')).toMatchObject({ ok: false, error: 'not_found' })
    expect(await listSharesFor(repo, 'c', D1)).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('owner lists shares', async () => {
    expect(await listSharesFor(repo, 'a', D1)).toEqual({ ok: true, value: [bob] })
  })
})

describe('UUID guard (repo throws on non-UUID ids like Postgres 22P02)', () => {
  const strict = (): Repo => {
    const base = memoryRepo(seed())
    const guard = <A extends unknown[], R>(f: (id: string, ...a: A) => Promise<R>) =>
      async (id: string, ...a: A) => { if (!UUID_RE.test(id)) throw new Error('22P02'); return f(id, ...a) }
    return { ...base, getDocument: guard(base.getDocument), getSharedUserIds: guard(base.getSharedUserIds), listShares: guard(base.listShares) }
  }
  it('getDocumentFor and share/unshare/list return not_found', async () => {
    const r = strict()
    expect(await getDocumentFor(r, 'abc', 'a')).toMatchObject({ ok: false, error: 'not_found' })
    expect(await shareDocument(r, 'a', 'abc', 'bob@demo.test')).toMatchObject({ ok: false, error: 'not_found' })
    expect(await unshareDocument(r, 'a', 'abc', 'b')).toMatchObject({ ok: false, error: 'not_found' })
    expect(await listSharesFor(r, 'a', 'abc')).toMatchObject({ ok: false, error: 'not_found' })
  })
})
