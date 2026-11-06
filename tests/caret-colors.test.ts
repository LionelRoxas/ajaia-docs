import { describe, it, expect } from 'vitest'
import { CARET_COLORS, DEFAULT_CARET_COLOR, colorFor, safeCaretColor } from '@/lib/caret-colors'

describe('caret colors', () => {
  it('colorFor is stable and from the palette', () => {
    expect(colorFor('user-1')).toBe(colorFor('user-1'))
    expect(CARET_COLORS).toContain(colorFor('user-1'))
  })
  it('only palette colors pass; anything else falls back', () => {
    expect(safeCaretColor(CARET_COLORS[2])).toBe(CARET_COLORS[2])
    for (const bad of ['#ff00ff', 'red', 'url(x)', 'red;background:url(//x)', undefined, 42, null])
      expect(safeCaretColor(bad)).toBe(DEFAULT_CARET_COLOR)
  })
})
