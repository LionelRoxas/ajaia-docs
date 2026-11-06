export const DEMO_USERS: { email: string; name: string }[] = [
  { email: 'alice@demo.test', name: 'Alice' },
  { email: 'bob@demo.test', name: 'Bob' },
  { email: 'carol@demo.test', name: 'Carol' },
]

export const TITLE_MAX = 200
export const CONTENT_MAX_BYTES = 1_000_000
export const UPLOAD_MAX_BYTES = 1_048_576
export const DEFAULT_TITLE = 'Untitled document'
export const YDOC_MAX_BYTES = 2_000_000
/** Live saves send base64; keep it under next.config's 2 MB Server Action body limit. */
export const SAVE_B64_MAX_CHARS = 1_900_000
