'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/design'
import { oc } from '@/lib/client'
import { DOWNTIME_CAUSES } from '@/lib/labels'
import { FormDialog } from '../form-dialog'

/** A datetime-local value in the browser's time zone, as an ISO instant. */
const instant = (v: string) => (v ? new Date(v).toISOString() : undefined)

export function StartShift({ variant = 'solid' }: { variant?: 'solid' | 'outline' }) {
  return (
    <FormDialog
      trigger="Start shift"
      triggerVariant={variant}
      triggerTestId="start-shift"
      title="Start a shift"
      description="The operator in charge of the reactor until the next handover."
      fields={[
        { name: 'operator', label: 'Operator', required: true, testId: 'shift-operator', placeholder: 'Full name' },
        { name: 'startedAt', label: 'Started', type: 'datetime-local', hint: 'Leave empty for now', testId: 'shift-start' },
        { name: 'notes', label: 'Notes', type: 'textarea', testId: 'shift-notes' },
      ]}
      submitLabel="Start shift"
      submitTestId="shift-submit"
      path="/shifts"
      transform={(v) => ({ operator: v.operator, startedAt: instant(v.startedAt), notes: v.notes })}
    />
  )
}

export function EndShift({ id, operator, notes }: { id: string; operator: string; notes: string | null }) {
  return (
    <FormDialog
      trigger="End shift"
      triggerVariant="outline"
      triggerTestId="end-shift"
      title={`End ${operator}'s shift`}
      description="The handover is the first thing the next shift reads."
      fields={[
        {
          name: 'handover',
          label: 'Handover',
          type: 'textarea',
          required: true,
          hint: 'What is running, what to watch, what is pending',
          testId: 'shift-handover',
        },
        { name: 'notes', label: 'What happened on this shift', type: 'textarea', defaultValue: notes ?? '', testId: 'shift-end-notes' },
        { name: 'endedAt', label: 'Ended', type: 'datetime-local', hint: 'Leave empty for now', testId: 'shift-end' },
      ]}
      submitLabel="End shift"
      submitTestId="shift-end-submit"
      path={`/shifts/${id}`}
      method="PATCH"
      transform={(v) => ({ end: true, endedAt: instant(v.endedAt), handover: v.handover, notes: v.notes })}
    />
  )
}

export function LogDowntime({ variant = 'outline' }: { variant?: 'solid' | 'outline' }) {
  return (
    <FormDialog
      trigger="Log downtime"
      triggerVariant={variant}
      triggerTestId="log-downtime"
      title="Log downtime"
      description="Any time the reactor was not producing. Leave the end empty while it is still down."
      fields={[
        {
          name: 'cause',
          label: 'Cause',
          type: 'select',
          required: true,
          options: DOWNTIME_CAUSES,
          testId: 'downtime-cause',
        },
        { name: 'startedAt', label: 'Started', type: 'datetime-local', hint: 'Leave empty for now', testId: 'downtime-start' },
        { name: 'endedAt', label: 'Ended', type: 'datetime-local', hint: 'Leave empty if the reactor is still down', testId: 'downtime-end' },
        { name: 'note', label: 'Note', type: 'textarea', testId: 'downtime-note' },
      ]}
      submitLabel="Log downtime"
      submitTestId="downtime-submit"
      path="/downtime"
      transform={(v) => ({ cause: v.cause, startedAt: instant(v.startedAt), endedAt: instant(v.endedAt), note: v.note })}
    />
  )
}

export function EndDowntime({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        data-testid="end-downtime"
        onClick={async () => {
          setBusy(true)
          setError(null)
          const r = await oc(`/downtime/${id}`, { method: 'PATCH', body: {} })
          setBusy(false)
          if (!r.ok) return setError(r.error)
          router.refresh()
        }}
      >
        {busy ? 'Saving…' : 'Back up now'}
      </Button>
      {error && <span style={{ color: 'var(--negative-ink)', fontSize: 'var(--t-ui-sm)' }}>{error}</span>}
    </span>
  )
}
