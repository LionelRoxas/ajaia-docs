import type { DocRow, Role } from './types'

export function roleFor(doc: Pick<DocRow, 'owner_id'>, sharedUserIds: string[], userId: string): Role | null {
  if (doc.owner_id === userId) return 'owner'
  return sharedUserIds.includes(userId) ? 'editor' : null
}
export const canEdit = (role: Role | null): boolean => role !== null
export const canShare = (role: Role | null): boolean => role === 'owner'
