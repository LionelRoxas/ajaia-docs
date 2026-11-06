import { describe, it, expect, beforeEach } from 'vitest'
import { memoryRepo } from '@/lib/repo.memory'
import type { Repo } from '@/lib/repo'
import type { DocRow, Profile } from '@/lib/types'
import { getLiveEpoch, openLiveDocument } from '@/lib/live'
import { unshareDocument } from '@/lib/sharing'

const D1 = '00000000-0000-4000-8000-000000000001'
const alice: Profile = { id: 'a', email: 'alice@demo.test', name: 'Alice' }
const bob: Profile = { id: 'b', email: 'bob@demo.test', name: 'Bob' }
const carol: Profile = { id: 'c', email: 'carol@demo.test', name: 'Carol' }
const welcome: DocRow = {
  id: D1, owner_id: 'a', title: 'Welcome', content: { type: 'doc', content: [{ type: 'paragraph' }] }, ydoc: null, version: 1,
  share_epoch: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

let repo: Repo
beforeEach(() => {
  repo = memoryRepo({ profiles: [alice, bob, carol], docs: [{ ...welcome }], shares: [[D1, 'b'], [D1, 'c']] })
})

describe('share epoch', () => {
  it('openLiveDocument returns the current epoch', async () => {
    const r = await openLiveDocument(repo, D1, 'b')
    expect(r.ok && r.value.epoch).toBe(0)
  })
  it('getLiveEpoch returns epoch and title for owner and editors', async () => {
    expect(await getLiveEpoch(repo, 'a', D1)).toEqual({ ok: true, value: { epoch: 0, title: 'Welcome' } })
    expect(await getLiveEpoch(repo, 'b', D1)).toEqual({ ok: true, value: { epoch: 0, title: 'Welcome' } })
  })
  it('after unshare: remaining members get the new epoch, the removed user gets not_found', async () => {
    await unshareDocument(repo, 'a', D1, 'b')
    expect(await getLiveEpoch(repo, 'a', D1)).toMatchObject({ ok: true, value: { epoch: 1 } })
    expect(await getLiveEpoch(repo, 'c', D1)).toMatchObject({ ok: true, value: { epoch: 1 } })
    expect(await getLiveEpoch(repo, 'b', D1)).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('stranger and bad id get not_found', async () => {
    expect(await getLiveEpoch(repo, 'x', D1)).toMatchObject({ ok: false, error: 'not_found' })
    expect(await getLiveEpoch(repo, 'a', 'abc')).toMatchObject({ ok: false, error: 'not_found' })
  })
})
