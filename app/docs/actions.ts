'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { supabaseRepo } from '@/lib/repo'
import { createDocument } from '@/lib/documents'
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
