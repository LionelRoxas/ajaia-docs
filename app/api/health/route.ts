import { createAdminClient } from '@/lib/supabase/server'

// Always run at request time so the keep-alive query really hits the database.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { error } = await createAdminClient().from('profiles').select('id').limit(1)
    if (error) return Response.json({ ok: false }, { status: 503 })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}
