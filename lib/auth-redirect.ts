// Only same-origin paths are allowed as a post-sign-in destination; anything else falls back to /docs.
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/docs'
  return raw
}
