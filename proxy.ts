import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isPageNavigation, safeNext } from '@/lib/auth-redirect'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  const { data } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const redirectTo = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }
  if (!isPageNavigation(request.method, request.headers)) return response
  // Signed-out visitors to a doc come back to it after signing in.
  if (!data.user && pathname.startsWith('/docs')) {
    return redirectTo(`/?next=${encodeURIComponent(pathname + request.nextUrl.search)}`)
  }
  if (data.user && pathname === '/') return redirectTo(safeNext(request.nextUrl.searchParams.get('next')))
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
