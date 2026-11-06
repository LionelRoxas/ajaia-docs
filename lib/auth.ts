import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export const getUser = cache(async (): Promise<Profile | null> => {
  const supabase = await createSessionClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  const authUser = data.user
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, name')
    .eq('id', authUser.id)
    .maybeSingle()
  if (profile) return profile as Profile
  // The signup trigger normally creates the row; recreate it if missing, since documents.owner_id needs it.
  const email = (authUser.email ?? '').toLowerCase()
  const metaName = authUser.user_metadata?.name
  const fallback: Profile = {
    id: authUser.id,
    email,
    name: typeof metaName === 'string' && metaName ? metaName : email.split('@')[0],
  }
  const { data: created, error } = await admin
    .from('profiles')
    .upsert(fallback, { onConflict: 'id' })
    .select('id, email, name')
    .single()
  if (error) console.error('profile upsert failed', error.message)
  return (created as Profile | null) ?? fallback
})

export async function requireUser(): Promise<Profile> {
  const user = await getUser()
  if (!user) redirect('/')
  return user
}
