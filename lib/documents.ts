import type { JSONContent } from '@tiptap/core'
import { roleFor } from './access'
import { CONTENT_MAX_BYTES, DEFAULT_TITLE, TITLE_MAX } from './limits'
import type { Repo } from './repo'
import type { DocRow, DocSummary, ErrorCode, Result, Role, SharedSummary } from './types'

const fail = (error: ErrorCode, message: string) => ({ ok: false as const, error, message })
const notFound = () => fail('not_found', 'Document not found')

export function normalizeTitle(raw: string): Result<string> {
  const t = raw.trim() || DEFAULT_TITLE
  return t.length > TITLE_MAX ? fail('invalid', `Title must be ${TITLE_MAX} characters or fewer`) : { ok: true, value: t }
}

export function contentTooBig(content: JSONContent): boolean {
  return new TextEncoder().encode(JSON.stringify(content)).length > CONTENT_MAX_BYTES
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function accessFor(repo: Repo, id: string, userId: string): Promise<{ doc: DocRow; role: Role } | null> {
  if (!UUID_RE.test(id)) return null // non-UUID ids would make Postgres throw (22P02)
  const doc = await repo.getDocument(id)
  if (!doc) return null
  const role = roleFor(doc, await repo.getSharedUserIds(id), userId)
  return role ? { doc, role } : null
}

export async function getDocumentFor(repo: Repo, id: string, userId: string): Promise<Result<{ doc: DocRow; role: Role; ownerName: string }>> {
  const a = await accessFor(repo, id, userId)
  if (!a) return notFound()
  const owner = await repo.getProfile(a.doc.owner_id)
  return { ok: true, value: { ...a, ownerName: owner?.name ?? '' } }
}

export async function listDocumentsFor(repo: Repo, userId: string): Promise<{ owned: DocSummary[]; shared: SharedSummary[] }> {
  const [owned, shared] = await Promise.all([repo.listOwned(userId), repo.listShared(userId)])
  return { owned, shared }
}

export async function createDocument(repo: Repo, userId: string, input: { title?: string; content?: JSONContent } = {}): Promise<Result<DocRow>> {
  const title = normalizeTitle(input.title ?? '')
  if (!title.ok) return title
  const content = input.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }
  if (contentTooBig(content)) return fail('invalid', 'Document is too large')
  return { ok: true, value: await repo.insertDocument(userId, title.value, content) }
}
