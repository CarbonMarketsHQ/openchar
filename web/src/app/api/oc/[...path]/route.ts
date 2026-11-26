import { NextResponse, type NextRequest } from 'next/server'
import { apiHeaders } from '@/lib/api'

const API_URL = process.env.API_URL ?? 'http://localhost:8788'

/** Generic authenticated pass-through to the OpenChar API. The browser
 * calls /api/oc/<path>; the server forwards with the service token plus
 * the user's session and project from cookies. */
async function forward(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const url = `${API_URL}/${path.join('/')}${req.nextUrl.search}`
  const headers = await apiHeaders()
  const contentType = req.headers.get('content-type')
  if (contentType) headers['content-type'] = contentType
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer()
  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    cache: 'no-store',
  }).catch(() => null)
  if (!upstream) return NextResponse.json({ error: 'the data service is unreachable' }, { status: 502 })
  const resHeaders = new Headers()
  const upstreamType = upstream.headers.get('content-type')
  if (upstreamType) resHeaders.set('content-type', upstreamType)
  return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders })
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE }
