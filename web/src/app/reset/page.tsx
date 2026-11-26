'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Button, Logo, Notice } from '@/design'
import { SITE } from '@/content/site'

function ResetInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token')
  const invite = params.get('invite') === '1'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)

  if (!token) {
    return (
      <main className="enter">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            setBusy(true)
            setError(null)
            await fetch('/api/oc/auth/request-reset', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: String(f.get('email')) }),
            }).catch(() => undefined)
            setBusy(false)
            setRequested(true)
          }}
        >
          <div className="enter-brand enter-brand--small">
            <Logo size={24} title="CarbonMarketsHQ" />
            <span>{SITE.name}</span>
          </div>
          <h1>Reset password</h1>
          {requested ? (
            <Notice tone="positive" title="Request recorded">
              <span data-testid="reset-requested">
                If an account exists for that email, a reset link is on its way. It stays valid for
                30 minutes. On a server without email set up, ask your admin for the link.
              </span>
            </Notice>
          ) : (
            <>
              <label className="ui-label" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" type="email" required autoFocus className="ui-input" data-testid="reset-email" />
              <Button type="submit" variant="solid" disabled={busy} data-testid="reset-request">
                {busy ? 'Sending…' : 'Request reset'}
              </Button>
            </>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>
            <a href="/login">Back to sign in</a>
          </p>
        </form>
      </main>
    )
  }

  return (
    <main className="enter">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          setBusy(true)
          setError(null)
          const res = await fetch('/api/oc/auth/reset', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token, newPassword: String(f.get('password')) }),
          }).catch(() => null)
          const data = (await res?.json().catch(() => null)) as { error?: string } | null
          setBusy(false)
          if (!res?.ok) return setError(data?.error ?? 'The reset did not go through.')
          router.push('/login')
        }}
      >
        <div className="enter-brand enter-brand--small">
          <Logo size={24} title="CarbonMarketsHQ" />
          <span>{SITE.name}</span>
        </div>
        <h1>{invite ? 'Welcome. Choose your password' : 'Choose a new password'}</h1>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>
          {invite
            ? 'You were invited to a workspace on OpenChar. Pick a password of at least 10 characters, then sign in.'
            : 'Every existing session on the account signs out when it changes.'}
        </p>
        <label className="ui-label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={10}
          required
          autoFocus
          className="ui-input"
          data-testid="reset-password"
          autoComplete="new-password"
        />
        {error && (
          <p data-testid="reset-error" style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }}>
            {error}
          </p>
        )}
        <Button type="submit" variant="solid" disabled={busy} data-testid="reset-save">
          {busy ? 'Saving…' : 'Set password'}
        </Button>
      </form>
    </main>
  )
}

export default function Reset() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  )
}
