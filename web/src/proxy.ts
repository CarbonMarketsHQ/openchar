import { NextResponse, type NextRequest } from 'next/server'
import { extraPublicPaths, hasHome } from '@/ext/routes'

/**
 * Session gate at the edge. Presence-only check (full validation happens on
 * every API call server-side); no session cookie means the login screen.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const open =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/reset' ||
    pathname === '/api/oc/auth/config' ||
    pathname.startsWith('/api/oc/auth/request-reset') ||
    pathname.startsWith('/api/oc/auth/reset') ||
    pathname.startsWith('/public') ||
    pathname.startsWith('/api/session') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.webmanifest'
  if (open || (pathname === '/' && hasHome) || extraPublicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  if (req.cookies.get('oc_session')?.value) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return new NextResponse(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('to', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|icon.svg|icons/).*)'],
}
