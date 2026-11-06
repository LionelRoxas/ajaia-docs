import 'server-only'
import { createAdminClient } from './supabase/server'

/**
 * Tells everyone still on a doc's old live topic to refetch their epoch, so revocation works even
 * when the owner unshares from a tab that isn't on the doc. REST broadcast with the service role
 * (bypasses the topic policy), no socket. The key never leaves the server.
 */
export async function broadcastRekey(docId: string, epoch: number): Promise<void> {
  const db = createAdminClient()
  await db.realtime.setAuth() // REST broadcast reads the token set here (the service key)
  const ch = db.channel(`doc:${docId}:${epoch}`, { config: { private: true } })
  await ch.httpSend('rekey', {}, { timeout: 3000 })
}
