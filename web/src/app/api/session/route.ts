import { NextResponse, type NextRequest } from 'next/server'
import { PROJECT_COOKIE, SESSION_COOKIE, clientIp } from '@/lib/api'

const API_URL = process.env.API_URL ?? 'http://localhost:8788'
const API_TOKEN = process.env.API_TOKEN ?? 'dev-token'

/** Login, signup, logout and project selection: the four calls that may
 * set or clear cookies, so they stay out of the generic proxy. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    action: 'login' | 'signup' | 'logout' | 'select-project'
    email?: string
    password?: string
    workspaceName?: string
    name?: string
    projectId?: string
  }

  if (body.action === 'logout') {
    const res = NextResponse.json({ ok: true })
    res.cookies.delete(SESSION_COOKIE)
    res.cookies.delete(PROJECT_COOKIE)
    return res
  }

  if (body.action === 'select-project') {
    if (!body.projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    const res = NextResponse.json({ ok: true })
    res.cookies.set(PROJECT_COOKIE, body.projectId, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
    return res
  }

  const path = body.action === 'signup' ? '/auth/signup' : '/auth/login'
  const ip = await clientIp()
  const upstream = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'content-type': 'application/json',
      ...(ip ? { 'X-Client-IP': ip } : {}),
    },
    body: JSON.stringify(
      body.action === 'signup'
        ? { workspaceName: body.workspaceName, name: body.name, email: body.email, password: body.password }
        : { email: body.email, password: body.password }
    ),
    cache: 'no-store',
  }).catch(() => null)
  if (!upstream) return NextResponse.json({ error: 'the data service is unreachable' }, { status: 502 })
  const data = (await upstream.json().catch(() => ({}))) as { token?: string; error?: string }
  if (!upstream.ok || !data.token) {
    return NextResponse.json({ error: data.error ?? 'sign-in failed' }, { status: upstream.status })
  }

  // Pick the first project of the workspace as the active one.
  const me = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'X-Session': data.token },
    cache: 'no-store',
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === 'production',
  })
  const firstProject = me?.projects?.[0]?.id
  if (firstProject) {
    res.cookies.set(PROJECT_COOKIE, firstProject, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  } else {
    res.cookies.delete(PROJECT_COOKIE)
  }
  return res
}
