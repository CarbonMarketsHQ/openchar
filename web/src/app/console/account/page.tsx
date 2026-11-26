'use client'

import { useEffect, useState } from 'react'
import { Button, Card, CardBody, CardHead, CardTitle, Field, Input, Notice } from '@/design'
import { oc } from '@/lib/client'
import { FormDialog } from '../form-dialog'
import { statusLabel } from '@/lib/labels'

type TeamUser = { id: string; email: string; name: string; role: string }
type AuthEvent = { at: string; email: string | null; kind: string; ip: string | null }
type BackupStatus = {
  lastAt: string | null
  ageHours: number | null
  state: 'fresh' | 'late' | 'stale'
  offsite: boolean
}

function Backups() {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  useEffect(() => {
    void oc<BackupStatus>('/ops/backups').then((r) => r.ok && r.data && setStatus(r.data))
  }, [])
  if (!status) return null
  const when = status.lastAt ? new Date(status.lastAt).toLocaleString('en-IN', { hour12: false }) : null
  return (
    <Card style={{ maxWidth: 560 }}>
      <CardHead>
        <CardTitle desc="Database and evidence files, every night, kept seven days on the server and 35 days offsite.">
          Backups
        </CardTitle>
      </CardHead>
      <CardBody>
        <div data-testid="backup-status" data-state={status.state}>
          {status.state === 'fresh' ? (
            <p style={{ margin: 0 }}>
              Last backup {when}, {Math.max(0, Math.round(status.ageHours ?? 0))} hours ago
              {status.offsite ? ', copied offsite.' : '. The offsite copy failed; the server copy is intact.'}
            </p>
          ) : (
            <Notice tone={status.state === 'late' ? 'caution' : 'negative'} title={when ? 'Backup overdue' : 'No backup on record'}>
              {when ? `The last backup ran ${when}. ` : ''}Check the openchar-backup timer on the server
              (systemctl status openchar-backup.timer).
            </Notice>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

function SecurityEvents() {
  const [events, setEvents] = useState<AuthEvent[] | null>(null)
  useEffect(() => {
    void oc<AuthEvent[]>('/auth/events').then((r) => r.ok && r.data && setEvents(r.data))
  }, [])
  if (!events) return null
  const alerts = events.filter((e) => e.kind.startsWith('alert-'))
  return (
    <Card style={{ maxWidth: 560 }}>
      <CardHead>
        <CardTitle desc="Sign-ins, failures, resets and automatic alerts for this workspace's accounts.">
          Security events
        </CardTitle>
      </CardHead>
      <CardBody>
        <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
          {alerts.map((e, i) => (
            <Notice key={`a${i}`} tone="negative" title="Alert">
              <span data-testid="security-alert">
                {statusLabel(e.kind.replace('alert-', ''))} on {e.email} at{' '}
                {new Date(e.at).toLocaleString('en-IN', { hour12: false })}
              </span>
            </Notice>
          ))}
          {events.slice(0, 10).map((e, i) => (
            <div key={i} className="dp-row" data-testid="security-event">
              <span className="mono muted">{new Date(e.at).toLocaleString('en-IN', { hour12: false })}</span>
              <b>{statusLabel(e.kind)}</b>
              <span className="muted">{e.email ?? ''}</span>
              <span className="mono muted">{e.ip ?? ''}</span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

function Team() {
  const [users, setUsers] = useState<TeamUser[] | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [invite, setInvite] = useState<{ email: string; link: string; mailed: boolean } | null>(null)
  useEffect(() => {
    void oc<TeamUser[]>('/auth/users').then((r) => {
      if (r.ok && r.data) {
        setUsers(r.data)
        setIsAdmin(true)
      }
    })
  }, [])
  if (!isAdmin || !users) return null
  return (
    <Card style={{ maxWidth: 560 }}>
      <CardHead>
        <CardTitle desc="A verifier seat is read-only: an auditor sees everything and can change nothing.">
          Team
        </CardTitle>
      </CardHead>
      <CardBody>
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          {users.map((u) => (
            <div key={u.id} className="dp-row" data-testid="team-row">
              <b>{u.name}</b>
              <span className="muted">{u.email}</span>
              <span className="mono muted">{statusLabel(u.role)}</span>
            </div>
          ))}
          <div>
            <FormDialog
              trigger="Add teammate"
              triggerVariant="outline"
              triggerTestId="add-user"
              title="Add a teammate"
              description="They get a link to choose their own password. Leave the password empty unless you want to set a starting one yourself."
              path="/auth/users"
              submitTestId="user-save"
              fields={[
                { name: 'name', label: 'Name', required: true, testId: 'user-name' },
                { name: 'email', label: 'Email', type: 'text', required: true, testId: 'user-email' },
                {
                  name: 'role',
                  label: 'Role',
                  type: 'select',
                  options: [
                    { value: 'member', label: 'Member (full access)' },
                    { value: 'verifier', label: 'Verifier (read-only auditor seat)' },
                    { value: 'admin', label: 'Admin' },
                  ],
                  defaultValue: 'member',
                  testId: 'user-role',
                },
                { name: 'password', label: 'Starting password (optional)', hint: 'At least 10 characters. Empty sends an invite link instead.', testId: 'user-password' },
              ]}
              transform={(v) => ({ ...v, password: v.password || undefined })}
              onDone={(data) => {
                const d = data as { inviteLink?: string; mailed?: boolean } | null
                if (d?.inviteLink) setInvite({ email: '', link: d.inviteLink, mailed: !!d.mailed })
                void oc<TeamUser[]>('/auth/users').then((r) => r.ok && r.data && setUsers(r.data))
              }}
            />
          </div>
          {invite && (
            <Notice tone="positive" title={invite.mailed ? 'Invite sent' : 'Invite link ready'}>
              <span>
                {invite.mailed
                  ? 'They will get an email with this link. You can also pass it on yourself; it works for 7 days.'
                  : 'This server has no email set up, so pass this link on yourself. It works for 7 days.'}
              </span>
              <code className="mono invite-link" data-testid="invite-link">
                {invite.link}
              </code>
            </Notice>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

export default function Account() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  return (
    <>
      <div className="page-head">
        <h1>Account</h1>
      </div>
      <Card style={{ maxWidth: 480 }}>
        <CardHead>
          <CardTitle desc="Changing it signs out every other session on this account.">Change password</CardTitle>
        </CardHead>
        <CardBody>
          <form
            style={{ display: 'grid', gap: 'var(--sp-4)' }}
            onSubmit={async (e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              setBusy(true)
              setError(null)
              setDone(false)
              const r = await oc('/auth/change-password', {
                body: {
                  currentPassword: String(f.get('current')),
                  newPassword: String(f.get('next')),
                },
              })
              setBusy(false)
              if (!r.ok) return setError(r.error)
              setDone(true)
              e.currentTarget?.reset?.()
            }}
          >
            <Field label="Current password" required>
              {(p) => <Input {...p} name="current" type="password" required autoComplete="current-password" data-testid="pw-current" />}
            </Field>
            <Field label="New password" hint="At least 10 characters." required>
              {(p) => <Input {...p} name="next" type="password" minLength={10} required autoComplete="new-password" data-testid="pw-next" />}
            </Field>
            {error && <p style={{ color: 'var(--negative-ink)', margin: 0, fontSize: 'var(--t-ui-sm)' }}>{error}</p>}
            {done && (
              <Notice tone="positive" title="Password changed">
                <span data-testid="pw-done">Other sessions on this account are signed out.</span>
              </Notice>
            )}
            <Button type="submit" variant="solid" disabled={busy} data-testid="pw-save">
              {busy ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        </CardBody>
      </Card>
      <Team />
      <Backups />
      <SecurityEvents />
    </>
  )
}
