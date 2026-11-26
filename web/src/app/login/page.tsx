'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Button, Logo } from '@/design'
import { session, useAuthConfig } from '@/lib/client'
import { SITE } from '@/content/site'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const config = useAuthConfig()

  // A server with no accounts yet goes straight to its first-run setup.
  useEffect(() => {
    if (config?.setupRequired) router.replace('/signup')
  }, [config, router])

  return (
    <main className="enter">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          setBusy(true)
          setError(null)
          const r = await session({
            action: 'login',
            email: String(f.get('email')),
            password: String(f.get('password')),
          })
          setBusy(false)
          if (!r.ok) return setError(r.error)
          router.push(params.get('to') ?? '/console')
          router.refresh()
        }}
      >
        <div className="enter-brand">
          <Logo size={32} title="CarbonMarketsHQ" />
          <h1>{SITE.name}</h1>
        </div>
        <label className="ui-label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required autoFocus className="ui-input" data-testid="login-email" autoComplete="email" />
        <label className="ui-label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" required className="ui-input" data-testid="login-password" autoComplete="current-password" />
        {error && (
          <p data-testid="login-error" style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }}>
            {error}
          </p>
        )}
        <Button type="submit" variant="solid" disabled={busy} data-testid="login-submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>
          {config?.signupUrl && (
            <>
              New team?{' '}
              <a href={config.signupUrl} data-testid="signup-link">
                Create an account
              </a>{' '}
              ·{' '}
            </>
          )}
          <a href="/reset" data-testid="forgot-link">
            Forgot password?
          </a>
        </p>
      </form>
    </main>
  )
}

export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
