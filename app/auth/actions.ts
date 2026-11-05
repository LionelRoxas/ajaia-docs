'use server'

import { redirect } from 'next/navigation'
import { createAdminClient, createSessionClient } from '@/lib/supabase/server'
import { DEMO_USERS } from '@/lib/limits'

type AuthResult = { error: string } | undefined

export async function signIn(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { error: 'Enter your email and password' }
  const supabase = await createSessionClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Invalid email or password' }
  redirect('/docs')
}

export async function signUp(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Enter your name' }
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters' }

  const { error: createErr } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })
  if (createErr) {
    const exists = createErr.code === 'email_exists'
    return { error: exists ? 'An account with that email already exists' : 'Could not create account' }
  }
  const supabase = await createSessionClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Account created, but sign-in failed. Try signing in.' }
  redirect('/docs')
}

export async function signInAsDemo(email: string): Promise<AuthResult> {
  if (!DEMO_USERS.some((u) => u.email === email)) return { error: 'Unknown demo account' }
  const password = process.env.DEMO_PASSWORD
  if (!password) return { error: 'Demo sign-in is not configured' }
  const supabase = await createSessionClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Demo sign-in failed' }
  redirect('/docs')
}

export async function signOut() {
  const supabase = await createSessionClient()
  await supabase.auth.signOut()
  redirect('/')
}
