'use client'

import { useEffect, useState } from 'react'

/** Browser-side call into the authenticated pass-through proxy. */
export async function oc<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  try {
    const res = await fetch(`/api/oc${path}`, {
      method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data?.error ?? `request failed (${res.status})`) }
  } catch {
    return { ok: false, status: 0, data: null, error: 'network error' }
  }
}

export async function session(body: Record<string, unknown>): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    return { ok: res.ok, error: res.ok ? null : (data?.error ?? 'request failed') }
  } catch {
    return { ok: false, error: 'network error' }
  }
}

export type AuthConfig = {
  setupRequired: boolean
  signup: 'open' | 'closed'
  signupUrl: string | null
  mailConfigured: boolean
}

/** What the sign-in screens show depends on the server: a first-run setup,
 * an open or closed sign-up, and whether reset links go out by email. */
export function useAuthConfig(): AuthConfig | null {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  useEffect(() => {
    void oc<AuthConfig>('/auth/config').then((r) => r.ok && r.data && setConfig(r.data))
  }, [])
  return config
}
