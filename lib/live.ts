import 'server-only'
import { canEdit } from './access'
import { accessFor, contentTooBig, normalizeTitle } from './documents'
import type { Repo } from './repo'
import type { DocRow, ErrorCode, Result, Role } from './types'
import { fromB64, jsonToYState, mergeStates, toB64, yStateToJson } from './ydoc'

const fail = (error: ErrorCode, message: string) => ({ ok: false as const, error, message })
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
  for (let attempt = 0; attempt < 3; attempt++) {
    const a = await accessFor(repo, input.id, userId)
    if (!a || !canEdit(a.role)) return notFound()
    let merged: Uint8Array
    let content
    try {
      const stored = a.doc.ydoc ?? toB64(jsonToYState(a.doc.content))
      merged = mergeStates([fromB64(stored), incoming])
      content = yStateToJson(merged)
    } catch {
      return fail('invalid', 'Malformed update')
    }
    if (contentTooBig(content)) return fail('invalid', 'Document is too large')
    const updated = await repo.updateIfVersion(input.id, a.doc.version, { content, ydoc: toB64(merged) })
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
