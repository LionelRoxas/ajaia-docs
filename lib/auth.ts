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
  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('id, email, name')
    .eq('id', data.user.id)
    .maybeSingle()
  if (profile) return profile as Profile
  const email = (authUser.email ?? '').toLowerCase()
  const metaName = authUser.user_metadata?.name
  return {
    id: authUser.id,
    email,
    name: typeof metaName === 'string' && metaName ? metaName : email.split('@')[0],
  }
})

export async function requireUser(): Promise<Profile> {
  const user = await getUser()
  if (!user) redirect('/')
  return user
}
