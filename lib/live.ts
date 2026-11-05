import 'server-only'
import { canEdit } from './access'
import { accessFor, contentTooBig, normalizeTitle } from './documents'
import type { Repo } from './repo'
import type { DocRow, ErrorCode, Result, Role } from './types'
import { YDOC_MAX_BYTES } from './limits'
import { compactState, fromB64, jsonToYState, mergeStates, toB64 } from './ydoc'

const fail = (error: ErrorCode, message: string) => ({ ok: false as const, error, message })
const TOO_BIG = 'Document is too large'
const CONFLICT_MSG = 'This document was changed by someone else. Reload to get the latest.'
const notFound = () => fail('not_found', 'Document not found')

export async function openLiveDocument(
  repo: Repo,
  id: string,
  userId: string,
): Promise<Result<{ doc: DocRow; role: Role; ownerName: string; ydoc: string }>> {
  const a = await accessFor(repo, id, userId)
  if (!a) return notFound()
  let doc = a.doc
  if (doc.ydoc === null) {
    const set = await repo.setYdocIfNull(id, toB64(jsonToYState(doc.content)))
    doc = set ?? (await repo.getDocument(id)) ?? doc // lost the race: re-read
  }
  if (doc.ydoc === null) return fail('invalid', 'Document state unavailable')
  const owner = await repo.getProfile(doc.owner_id)
  return { ok: true, value: { doc, role: a.role, ownerName: owner?.name ?? '', ydoc: doc.ydoc } }
}

export async function saveLiveUpdate(
  repo: Repo,
  userId: string,
  input: { id: string; update: string },
): Promise<Result<{ version: number }>> {
  let incoming: Uint8Array
  try {
    incoming = fromB64(input.update)
  } catch {
    return fail('invalid', 'Malformed update')
  }
  if (incoming.length > YDOC_MAX_BYTES) return fail('invalid', TOO_BIG)
  for (let attempt = 0; attempt < 3; attempt++) {
    const a = await accessFor(repo, input.id, userId)
    if (!a || !canEdit(a.role)) return notFound()
    if (a.doc.ydoc === null) return fail('conflict', CONFLICT_MSG) // client must open first
    let compact
    try {
      compact = compactState(mergeStates([fromB64(a.doc.ydoc), incoming]))
    } catch {
      return fail('invalid', 'Malformed update')
    }
    if (compact.state.length > YDOC_MAX_BYTES || contentTooBig(compact.json)) return fail('invalid', TOO_BIG)
    const updated = await repo.updateIfVersion(input.id, a.doc.version, { content: compact.json, ydoc: toB64(compact.state) })
    if (updated) return { ok: true, value: { version: updated.version } }
  }
  return fail('conflict', 'Could not save right now. Try again.')
}

export async function saveTitle(
  repo: Repo,
  userId: string,
  input: { id: string; title: string },
): Promise<Result<{ title: string }>> {
  const t = normalizeTitle(input.title)
  if (!t.ok) return t
  for (let attempt = 0; attempt < 3; attempt++) {
    const a = await accessFor(repo, input.id, userId)
    if (!a || !canEdit(a.role)) return notFound()
    // Last write wins: use the current version so it never conflicts on content.
    if (await repo.updateIfVersion(input.id, a.doc.version, { title: t.value })) return { ok: true, value: { title: t.value } }
  }
  return fail('conflict', 'Could not save right now. Try again.')
}
