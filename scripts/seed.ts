import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { DEMO_USERS } from '../lib/limits'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.DEMO_PASSWORD
if (!url || !serviceKey || !password) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or DEMO_PASSWORD in .env.local',
  )
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const WELCOME_CONTENT = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to Ajaia Docs' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Write, ' },
        { type: 'text', text: 'format', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' and share documents. Changes save automatically.' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Format text with the toolbar' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Upload .txt, .md or .docx files' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Share a document by email' }] }] },
      ],
    },
  ],
}

async function ensureUser(email: string, name: string): Promise<string> {
  const { data: existing, error: lookupErr } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (lookupErr) throw lookupErr
  if (existing) {
    console.log(`user exists: ${email}`)
    return existing.id
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: password!,
    email_confirm: true,
    user_metadata: { name },
  })
  if (error || !data.user) throw error ?? new Error(`createUser failed for ${email}`)
  console.log(`user created: ${email}`)
  return data.user.id
}

async function main() {
  const ids: Record<string, string> = {}
  for (const u of DEMO_USERS) ids[u.email] = await ensureUser(u.email, u.name)
  const aliceId = ids['alice@demo.test']
  const bobId = ids['bob@demo.test']

  const { data: doc, error: docLookupErr } = await admin
    .from('documents')
    .select('id')
    .eq('owner_id', aliceId)
    .eq('title', 'Welcome')
    .maybeSingle()
  if (docLookupErr) throw docLookupErr

  let docId = doc?.id as string | undefined
  if (!docId) {
    const { data, error } = await admin
      .from('documents')
      .insert({ owner_id: aliceId, title: 'Welcome', content: WELCOME_CONTENT })
      .select('id')
      .single()
    if (error) throw error
    docId = data.id
    console.log('created Welcome document')
  } else {
    console.log('Welcome document exists')
  }

  const { error: shareErr } = await admin
    .from('document_shares')
    .upsert({ document_id: docId, user_id: bobId }, { onConflict: 'document_id,user_id', ignoreDuplicates: true })
  if (shareErr) throw shareErr
  console.log('shared Welcome with Bob')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
