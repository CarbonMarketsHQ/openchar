'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, Logo, Notice } from '@/design'
import { session, useAuthConfig } from '@/lib/client'
import { SITE } from '@/content/site'

export default function Signup() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const config = useAuthConfig()
  const setup = !!config?.setupRequired

  if (config && !setup && config.signup === 'closed') {
    return (
      <main className="enter">
        <div className="enter-form">
          <div className="enter-brand enter-brand--small">
            <Logo size={24} title="CarbonMarketsHQ" />
            <span>{SITE.name}</span>
          </div>
          <h1>Sign-up is by invitation</h1>
          <Notice tone="info" title="Ask your workspace admin">
            <span data-testid="signup-closed">
              On this server, an admin adds each person from the Account page and they get a link to
              choose a password.
            </span>
          </Notice>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>
            <a href="/login">Back to sign in</a>
          </p>
        </div>
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
          const r = await session({
            action: 'signup',
            workspaceName: String(f.get('workspaceName')),
            name: String(f.get('name')),
            email: String(f.get('email')),
            password: String(f.get('password')),
          })
          setBusy(false)
          if (!r.ok) return setError(r.error)
          router.push('/console/projects')
          router.refresh()
        }}
      >
        <div className="enter-brand enter-brand--small">
          <Logo size={24} title="CarbonMarketsHQ" />
          <span>{SITE.name}</span>
        </div>
        <h1>{setup ? 'Set up this server' : 'Create a workspace'}</h1>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>
          {setup
            ? `No one has an account here yet. Create the first workspace and its admin; you can invite the rest of your team from inside.`
            : `A workspace holds your organisation's projects, facilities and records on ${SITE.name}.`}
        </p>
        <label className="ui-label" htmlFor="workspaceName">
          Organisation
        </label>
        <input id="workspaceName" name="workspaceName" required className="ui-input" data-testid="signup-workspace" />
        <label className="ui-label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" required className="ui-input" data-testid="signup-name" />
        <label className="ui-label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required className="ui-input" data-testid="signup-email" autoComplete="email" />
        <label className="ui-label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" minLength={10} required className="ui-input" data-testid="signup-password" autoComplete="new-password" />
        {error && (
          <p data-testid="signup-error" style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }}>
            {error}
          </p>
        )}
        <Button type="submit" variant="solid" disabled={busy} data-testid="signup-submit">
          {busy ? 'Creating…' : setup ? 'Create workspace and admin' : 'Create workspace'}
        </Button>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>
          Have an account? <a href="/login">Sign in</a>
        </p>
      </form>
    </main>
  )
}
