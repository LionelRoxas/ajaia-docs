import type { JSONContent } from '@tiptap/core'
import type { Repo } from './repo'
import type { DocRow, Profile } from './types'

export function memoryRepo(seed: { profiles?: Profile[]; docs?: DocRow[]; shares?: [string, string][] } = {}): Repo {
  const profiles = [...(seed.profiles ?? [])]
  const docs = new Map((seed.docs ?? []).map((d) => [d.id, structuredClone(d)]))
  const shares = new Set((seed.shares ?? []).map(([d, u]) => `${d}|${u}`))
  let clock = Date.now()
  const now = () => new Date(++clock).toISOString()
  let n = 0
  const byUpdated = <T extends { updated_at: string }>(a: T[]) =>
    a.sort((x, y) => y.updated_at.localeCompare(x.updated_at))
  const prof = (id: string) => profiles.find((p) => p.id === id) ?? null
  const sharedIds = (docId: string) =>
    [...shares].filter((s) => s.startsWith(`${docId}|`)).map((s) => s.split('|')[1])

  return {
    async getProfileByEmail(email) { return profiles.find((p) => p.email === email) ?? null },
    async getProfile(id) { return prof(id) },
    async getDocument(id) { const d = docs.get(id); return d ? structuredClone(d) : null },
    async getSharedUserIds(docId) { return sharedIds(docId) },
    async listShares(docId) {
      return sharedIds(docId).map(prof).filter((p): p is Profile => p !== null)
    },
    async listOwned(userId) {
      return byUpdated([...docs.values()].filter((d) => d.owner_id === userId)
        .map(({ id, title, updated_at }) => ({ id, title, updated_at })))
    },
    async listShared(userId) {
      return byUpdated([...docs.values()].filter((d) => shares.has(`${d.id}|${userId}`))
        .map(({ id, title, updated_at, owner_id }) => ({ id, title, updated_at, owner_name: prof(owner_id)?.name ?? '' })))
    },
    async insertDocument(ownerId, title, content: JSONContent) {
      const t = now()
      const d: DocRow = { id: `mem-${++n}`, owner_id: ownerId, title, content, ydoc: null, version: 1, created_at: t, updated_at: t }
      d.content = structuredClone(content)
      docs.set(d.id, d)
      return structuredClone(d)
    },
    async updateIfVersion(id, expectedVersion, patch) {
      const d = docs.get(id)
      if (!d || d.version !== expectedVersion) return null
      if (patch.title !== undefined) d.title = patch.title
      if (patch.content !== undefined) d.content = structuredClone(patch.content)
      if (patch.ydoc !== undefined) d.ydoc = patch.ydoc
      d.version = expectedVersion + 1
      d.updated_at = now()
      return structuredClone(d)
    },
    async setYdocIfNull(id, ydoc) {
      const d = docs.get(id)
      if (!d || d.ydoc !== null) return null
      d.ydoc = ydoc
      return structuredClone(d)
    },
    async addShare(docId, userId) { shares.add(`${docId}|${userId}`) },
    async removeShare(docId, userId) { shares.delete(`${docId}|${userId}`) },
  }
}
