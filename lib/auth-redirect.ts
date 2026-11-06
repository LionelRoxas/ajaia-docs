const UNSAFE = /[\x00-\x1f\x7f\\]/ // the URL parser strips/normalizes these, which can turn "/\t/x" into "//x"
const BASE = 'http://local'

// Only same-origin paths are allowed as a post-sign-in destination; anything else falls back to /docs.
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || UNSAFE.test(raw)) return '/docs'
  let u: URL
  try {
    u = new URL(raw, BASE)
  } catch {
    return '/docs'
  }
  if (u.origin !== BASE) return '/docs'
  const out = u.pathname + u.search + u.hash
  return out.startsWith('//') ? '/docs' : out
}

// The proxy only redirects page loads. Server Actions (POST with a next-action header) must reach
// their own getUser() and return `unauthorized`, or the client gets an HTML redirect it can't use.
export function isPageNavigation(method: string, headers: Headers): boolean {
  return (method === 'GET' || method === 'HEAD') && !headers.has('next-action')
}
