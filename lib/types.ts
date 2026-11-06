import type { JSONContent } from '@tiptap/core'
export type Profile = { id: string; email: string; name: string }
export type DocRow = { id: string; owner_id: string; title: string; content: JSONContent; ydoc: string | null; version: number; share_epoch: number; created_at: string; updated_at: string }
export type DocSummary = { id: string; title: string; updated_at: string }
export type SharedSummary = DocSummary & { owner_name: string }
export type Role = 'owner' | 'editor'
export type ErrorCode = 'not_found' | 'forbidden' | 'conflict' | 'invalid' | 'unauthorized'
export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode; message: string }
