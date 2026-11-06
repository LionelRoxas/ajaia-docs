import { accessFor } from './documents'
import type { Repo } from './repo'
import type { DocRow, ErrorCode, Profile, Result } from './types'

const fail = (error: ErrorCode, message: string) => ({ ok: false as const, error, message })

// No access or bad id -> not_found; has access but not owner -> forbidden.
async function ownedDoc(repo: Repo, userId: string, docId: string): Promise<Result<DocRow>> {
  const a = await accessFor(repo, docId, userId)
  if (!a) return fail('not_found', 'Document not found')
  if (a.role !== 'owner') return fail('forbidden', 'Only the owner can share this document')
  return { ok: true, value: a.doc }
}

export async function shareDocument(repo: Repo, ownerId: string, docId: string, email: string): Promise<Result<Profile>> {
  const d = await ownedDoc(repo, ownerId, docId)
  if (!d.ok) return d
  const target = await repo.getProfileByEmail(email.trim().toLowerCase())
  if (!target) return fail('invalid', 'No user with that email')
  if (target.id === ownerId) return fail('invalid', 'You already own this document')
  if ((await repo.getSharedUserIds(docId)).includes(target.id)) return fail('invalid', 'Already shared with this user')
  await repo.addShare(docId, target.id)
  return { ok: true, value: target }
}

export async function unshareDocument(
  repo: Repo,
  ownerId: string,
  docId: string,
  userId: string,
): Promise<Result<{ previousEpoch: number }>> {
  const d = await ownedDoc(repo, ownerId, docId)
  if (!d.ok) return d
  // Open live channels move to a new topic the removed user can't join.
  const previousEpoch = await repo.unshare(docId, userId)
  if (previousEpoch === null) return fail('not_found', 'Document not found')
  return { ok: true, value: { previousEpoch } }
}

export async function listSharesFor(repo: Repo, userId: string, docId: string): Promise<Result<Profile[]>> {
  const d = await ownedDoc(repo, userId, docId)
  if (!d.ok) return d
  return { ok: true, value: await repo.listShares(docId) }
}
