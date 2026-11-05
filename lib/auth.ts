import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export const getUser = cache(async (): Promise<Profile | null> => {
  const supabase = await createSessionClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('id, email, name')
    .eq('id', data.user.id)
    .maybeSingle()
  return (profile as Profile | null) ?? null
})

export async function requireUser(): Promise<Profile> {
  const user = await getUser()
  if (!user) redirect('/')
  return user
}
