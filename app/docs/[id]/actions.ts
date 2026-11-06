'use server'

import { getUser } from '@/lib/auth'
import { supabaseRepo } from '@/lib/repo'
import { getLiveEpoch, saveLiveUpdate, saveTitle } from '@/lib/live'
import { listSharesFor, shareDocument, unshareDocument } from '@/lib/sharing'
import { broadcastRekey } from '@/lib/live-notify'
import type { Profile, Result } from '@/lib/types'

const SESSION_EXPIRED = { ok: false as const, error: 'unauthorized' as const, message: 'Your session expired. Sign in again.' }

/** Merges a base64 Yjs update into the stored document state. */
export async function saveLiveUpdateAction(input: { id: string; update: string }): Promise<Result<{ version: number; epoch: number }>> {
  const user = await getUser()
  if (!user) return SESSION_EXPIRED
  return saveLiveUpdate(supabaseRepo(), user.id, input)
}

/** Live channel epoch + current title (after a rekey/title hint, or a channel error). */
export async function getLiveEpochAction(id: string): Promise<Result<{ epoch: number; title: string }>> {
  const user = await getUser()
  if (!user) return SESSION_EXPIRED
  return getLiveEpoch(supabaseRepo(), user.id, id)
}

export async function saveTitleAction(input: { id: string; title: string }): Promise<Result<{ title: string }>> {
  const user = await getUser()
  if (!user) return SESSION_EXPIRED
  return saveTitle(supabaseRepo(), user.id, input)
}

export async function shareAction(docId: string, email: string): Promise<Result<Profile>> {
  const user = await getUser()
  if (!user) return SESSION_EXPIRED
  return shareDocument(supabaseRepo(), user.id, docId, email)
}

export async function unshareAction(docId: string, userId: string): Promise<Result<null>> {
  const user = await getUser()
  if (!user) return SESSION_EXPIRED
  const r = await unshareDocument(supabaseRepo(), user.id, docId, userId)
  if (!r.ok) return r
  try {
    await broadcastRekey(docId, r.value.previousEpoch)
  } catch (e) {
    // Not fatal: peers also learn the new epoch from their next save result.
    console.error('rekey broadcast failed', e)
  }
  return { ok: true, value: null }
}

export async function listSharesAction(docId: string): Promise<Result<Profile[]>> {
  const user = await getUser()
  if (!user) return SESSION_EXPIRED
  return listSharesFor(supabaseRepo(), user.id, docId)
}
