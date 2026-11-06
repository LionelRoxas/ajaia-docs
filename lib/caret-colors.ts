// Caret colors: distinct, and dark enough for the white name label.
export const CARET_COLORS = ['#2453d6', '#c0362c', '#0f7b6c', '#8a4bd6', '#b45309', '#be185d', '#0369a1', '#4d7c0f'] as const
export const DEFAULT_CARET_COLOR = '#667085'

export function colorFor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return CARET_COLORS[h % CARET_COLORS.length]
}

/** Peers choose their own awareness color; only palette values are rendered. */
export function safeCaretColor(c: unknown): string {
  return (CARET_COLORS as readonly unknown[]).includes(c) ? (c as string) : DEFAULT_CARET_COLOR
}
