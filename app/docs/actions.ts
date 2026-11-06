'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser, requireUser } from '@/lib/auth'
import { broadcastRekey } from '@/lib/live-notify'
import type { Result } from '@/lib/types'
import { supabaseRepo } from '@/lib/repo'
import { createDocument, deleteDocument } from '@/lib/documents'
import { fileToDocument } from '@/lib/import'

export async function createDocumentAction(): Promise<void> {
  const user = await requireUser()
  const res = await createDocument(supabaseRepo(), user.id)
  if (!res.ok) throw new Error(res.message)
  redirect(`/docs/${res.value.id}`)
}

export async function importDocumentAction(formData: FormData): Promise<{ error: string } | void> {
  const user = await requireUser()
  const file = formData.get('file')
  if (!(file instanceof File) || !file.name) return { error: 'Choose a file to upload' }
  const parsed = await fileToDocument({ name: file.name, size: file.size, bytes: await file.arrayBuffer() })
  if (!parsed.ok) return { error: parsed.message }
  const res = await createDocument(supabaseRepo(), user.id, parsed.value)
  if (!res.ok) return { error: res.message }
  redirect(`/docs/${res.value.id}`)
}

/** Owner only. Peers on the doc's live topic are told to refetch, find it gone, and go read-only. */
export async function deleteDocumentAction(id: string): Promise<Result<null>> {
  const user = await getUser()
  if (!user) return { ok: false, error: 'unauthorized', message: 'Your session expired. Sign in again.' }
  const res = await deleteDocument(supabaseRepo(), user.id, id)
  if (!res.ok) return res
  revalidatePath('/docs')
  try {
    await broadcastRekey(id, res.value.epoch)
  } catch (e) {
    console.error('rekey broadcast failed', e) // not fatal: peers also notice on their next save
  }
  return { ok: true, value: null }
}
