import { describe, it, expect } from 'vitest'
import { roleFor, canEdit, canShare } from '@/lib/access'

describe('access', () => {
  const doc = { owner_id: 'a' }
  it('owner', () => expect(roleFor(doc, ['b'], 'a')).toBe('owner'))
  it('shared user is editor', () => expect(roleFor(doc, ['b'], 'b')).toBe('editor'))
  it('stranger is null', () => expect(roleFor(doc, ['b'], 'c')).toBeNull())
  it('editor cannot share', () => expect(canShare('editor')).toBe(false))
  it('owner can share', () => expect(canShare('owner')).toBe(true))
  it('null cannot edit', () => expect(canEdit(null)).toBe(false))
  it('editor can edit', () => expect(canEdit('editor')).toBe(true))
})
