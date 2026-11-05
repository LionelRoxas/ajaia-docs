import { describe, it, expect } from 'vitest'
import { relativeTime } from '@/lib/time'

const now = Date.parse('2026-11-05T12:00:00Z')
const ago = (s: number) => new Date(now - s * 1000).toISOString()

describe('relativeTime', () => {
  it('formats recent and older times', () => {
    expect(relativeTime(ago(10), now)).toBe('just now')
    expect(relativeTime(ago(5 * 60), now)).toBe('5 minutes ago')
    expect(relativeTime(ago(3 * 3600), now)).toBe('3 hours ago')
    expect(relativeTime(ago(86400), now)).toBe('yesterday')
    expect(relativeTime(ago(14 * 86400), now)).toBe('2 weeks ago')
    expect(relativeTime(ago(400 * 86400), now)).toBe('last year')
  })
})
