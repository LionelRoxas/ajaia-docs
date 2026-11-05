'use server'

import type { JSONContent } from '@tiptap/core'
import { getUser } from '@/lib/auth'
import { supabaseRepo } from '@/lib/repo'
import { saveDocument } from '@/lib/documents'
import { listSharesFor, shareDocument, unshareDocument } from '@/lib/sharing'
import type { Profile, Result } from '@/lib/types'

export async function saveDocumentAction(input: {
  id: string
  version: number
  title?: string
  content?: JSONContent
}): Promise<Result<{ version: number }>> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'unauthorized', message: 'Your session expired. Sign in again.' }
  return saveDocument(supabaseRepo(), user.id, input)
}

const SESSION_EXPIRED = { ok: false as const, error: 'unauthorized' as const, message: 'Your session expired. Sign in again.' }

export async function shareAction(docId: string, email: string): Promise<Result<Profile>> {
  const user = await getUser()
  if (!user) return SESSION_EXPIRED
  return shareDocument(supabaseRepo(), user.id, docId, email)
}

export async function unshareAction(docId: string, userId: string): Promise<Result<null>> {
  const user = await getUser()
  if (!user) return SESSION_EXPIRED
  return unshareDocument(supabaseRepo(), user.id, docId, userId)
}

export async function listSharesAction(docId: string): Promise<Result<Profile[]>> {
  const user = await getUser()
  if (!user) return SESSION_EXPIRED
  return listSharesFor(supabaseRepo(), user.id, docId)
}
