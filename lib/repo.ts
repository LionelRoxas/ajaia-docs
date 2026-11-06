import type { JSONContent } from '@tiptap/core'
import type { DocRow, DocSummary, Profile, SharedSummary } from './types'

export interface Repo {
  getProfileByEmail(email: string): Promise<Profile | null>
  getProfile(id: string): Promise<Profile | null>
  getDocument(id: string): Promise<DocRow | null>
  getSharedUserIds(docId: string): Promise<string[]>
  listShares(docId: string): Promise<Profile[]>
  listOwned(userId: string): Promise<DocSummary[]>
  listShared(userId: string): Promise<SharedSummary[]>
  insertDocument(ownerId: string, title: string, content: JSONContent): Promise<DocRow>
  updateIfVersion(id: string, expectedVersion: number, patch: { title?: string; content?: JSONContent; ydoc?: string }): Promise<DocRow | null>
  setYdocIfNull(id: string, ydoc: string): Promise<DocRow | null>
  addShare(docId: string, userId: string): Promise<void>
  removeShare(docId: string, userId: string): Promise<void>
  /** Moves the doc's live channel to a new topic, so a removed user's open channel goes stale. */
  bumpShareEpoch(docId: string): Promise<void>
}

// Implementation lives in repo.supabase.ts (server-only); tests import memoryRepo instead.
export { supabaseRepo } from './repo.supabase'
