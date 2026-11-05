'use server'

import type { JSONContent } from '@tiptap/core'
import { getUser } from '@/lib/auth'
import { supabaseRepo } from '@/lib/repo'
import { saveDocument } from '@/lib/documents'
import type { Result } from '@/lib/types'

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
