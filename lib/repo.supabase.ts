import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './supabase/server'
import type { Repo } from './repo'
import type { DocRow, DocSummary, Profile, SharedSummary } from './types'

function check<T>(r: { data: T | null; error: { message: string } | null }): T | null {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

export function supabaseRepo(db: SupabaseClient = createAdminClient()): Repo {
  return {
    async getProfileByEmail(email) {
      return check(await db.from('profiles').select('*').eq('email', email).maybeSingle<Profile>())
    },
    async getProfile(id) {
      return check(await db.from('profiles').select('*').eq('id', id).maybeSingle<Profile>())
    },
    async getDocument(id) {
      return check(await db.from('documents').select('*').eq('id', id).maybeSingle<DocRow>())
    },
    async getSharedUserIds(docId) {
      const rows = check(await db.from('document_shares').select('user_id').eq('document_id', docId)) ?? []
      return (rows as { user_id: string }[]).map((r) => r.user_id)
    },
    async listShares(docId) {
      const rows = check(
        await db.from('document_shares').select('profiles(id, email, name)').eq('document_id', docId).order('created_at'),
      ) as unknown as { profiles: Profile | null }[] | null
      return (rows ?? []).flatMap((r) => (r.profiles ? [r.profiles] : []))
    },
    async listOwned(userId) {
      const rows = check(
        await db.from('documents').select('id, title, updated_at').eq('owner_id', userId).order('updated_at', { ascending: false }),
      )
      return (rows ?? []) as DocSummary[]
    },
    async listShared(userId) {
      const rows = check(
        await db.from('document_shares').select('documents(id, title, updated_at, profiles!documents_owner_id_fkey(name))').eq('user_id', userId),
      ) as unknown as { documents: { id: string; title: string; updated_at: string; profiles: { name: string } | null } | null }[] | null
      const out: SharedSummary[] = (rows ?? []).flatMap((r) =>
        r.documents
          ? [{ id: r.documents.id, title: r.documents.title, updated_at: r.documents.updated_at, owner_name: r.documents.profiles?.name ?? '' }]
          : [],
      )
      return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    },
    async insertDocument(ownerId, title, content) {
      const row = check(
        await db.from('documents').insert({ owner_id: ownerId, title, content }).select('*').single<DocRow>(),
      )
      if (!row) throw new Error('insert returned no row')
      return row
    },
    async updateIfVersion(id, expectedVersion, patch) {
      return check(
        await db.from('documents')
          .update({ ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString() })
          .eq('id', id).eq('version', expectedVersion)
          .select('*').maybeSingle<DocRow>(),
      )
    },
    async setYdocIfNull(id, ydoc) {
      return check(
        await db.from('documents').update({ ydoc }).eq('id', id).is('ydoc', null).select('*').maybeSingle<DocRow>(),
      )
    },
    async addShare(docId, userId) {
      check(await db.from('document_shares').upsert({ document_id: docId, user_id: userId }, { onConflict: 'document_id,user_id', ignoreDuplicates: true }))
    },
    async deleteDocument(id) {
      check(await db.from('documents').delete().eq('id', id)) // document_shares cascades
    },
    async unshare(docId, userId) {
      // One transaction in Postgres (0005_unshare_atomic.sql); service role only.
      return check(await db.rpc('unshare_document', { doc: docId, target: userId })) as number | null
    },
  }
}
