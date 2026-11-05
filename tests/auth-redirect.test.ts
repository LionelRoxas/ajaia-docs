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

  it('never resolves to another origin when the URL parser strips control characters', () => {
    const attacks = ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/%09/evil.com', '/\u0000/evil.com', '/docs\\..\\//evil.com']
    for (const raw of attacks) {
      const out = safeNext(raw)
      expect(out.startsWith('/') && !out.startsWith('//') && !out.startsWith('/\\')).toBe(true)
      expect(new URL(out, 'http://localhost:3100').origin).toBe('http://localhost:3100')
    }
    expect(safeNext('/\t/evil.com')).toBe('/docs')
    expect(safeNext('/\n/evil.com')).toBe('/docs')
  })

  it('keeps path, search and hash', () => {
    expect(safeNext('/docs/abc?x=1#h')).toBe('/docs/abc?x=1#h')
  })
})
