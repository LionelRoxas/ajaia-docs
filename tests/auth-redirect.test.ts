import { describe, it, expect } from 'vitest'
import { safeNext } from '@/lib/auth-redirect'

describe('safeNext', () => {
  it('allows same-origin paths only', () => {
    expect(safeNext('/docs/abc')).toBe('/docs/abc')
    expect(safeNext('/docs/abc?x=1')).toBe('/docs/abc?x=1')
    expect(safeNext('//evil.com')).toBe('/docs')
    expect(safeNext('https://evil.com')).toBe('/docs')
    expect(safeNext('/\\evil.com')).toBe('/docs')
    expect(safeNext('')).toBe('/docs')
    expect(safeNext(null)).toBe('/docs')
    expect(safeNext(undefined)).toBe('/docs')
  })
})
