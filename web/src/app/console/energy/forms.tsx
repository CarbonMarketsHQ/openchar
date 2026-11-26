'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/design'
import { oc } from '@/lib/client'
import { FUELS, FUEL_USES } from '@/lib/labels'
import { FormDialog } from '../form-dialog'

const instant = (v: string) => (v ? new Date(v).toISOString() : undefined)

export function LogFuel({
  batchCode,
  batches = [],
  variant = 'solid',
}: {
  batchCode?: string
  batches?: string[]
  variant?: 'solid' | 'outline'
}) {
  return (
    <FormDialog
      trigger="Log fuel"
      triggerVariant={variant}
      triggerTestId="log-fuel"
      title={batchCode ? `Log fuel for ${batchCode}` : 'Log fuel'}
      description="Litres for liquid fuels, kilograms for LPG and biomass."
      fields={[
        { name: 'fuel', label: 'Fuel', type: 'select', required: true, options: FUELS.map((f) => ({ value: f.value, label: f.label })), testId: 'fuel-type' },
        { name: 'use', label: 'Used for', type: 'select', required: true, options: FUEL_USES, testId: 'fuel-use' },
        { name: 'quantity', label: 'Quantity', type: 'number', step: '0.1', min: '0.1', required: true, testId: 'fuel-qty' },
        ...(batchCode
          ? []
          : [
              {
                name: 'batchCode',
                label: 'Batch',
                type: 'select' as const,
                options: [{ value: '', label: 'Not for one batch' }, ...batches.map((b) => ({ value: b, label: b }))],
                testId: 'fuel-batch',
              },
            ]),
        { name: 'vehicle', label: 'Vehicle', hint: 'For a vehicle trip', testId: 'fuel-vehicle' },
        { name: 'tripKm', label: 'Trip distance (km)', type: 'number', step: '0.1', min: '0', testId: 'fuel-trip' },
        { name: 'loggedAt', label: 'When', type: 'datetime-local', hint: 'Leave empty for now', testId: 'fuel-when' },
      ]}
      submitLabel="Log fuel"
      submitTestId="fuel-submit"
      path="/fuel"
      transform={(v) => ({
        fuel: v.fuel,
        use: v.use,
        quantity: Number(v.quantity),
        batchCode: batchCode ?? (v.batchCode || undefined),
        vehicle: v.vehicle,
        tripKm: v.tripKm,
        loggedAt: instant(v.loggedAt),
      })}
    />
  )
}

export function AddReading({ meters }: { meters: string[] }) {
  return (
    <FormDialog
      trigger="Add reading"
      triggerVariant="outline"
      triggerTestId="add-reading"
      title="Add a meter reading"
      description="The meter's running total in kWh, as shown on its display."
      fields={[
        { name: 'meter', label: 'Meter', required: true, defaultValue: meters[0] ?? 'Main meter', testId: 'reading-meter' },
        { name: 'kwh', label: 'Total (kWh)', type: 'number', step: '0.1', min: '0', required: true, testId: 'reading-kwh' },
        { name: 'readAt', label: 'Read at', type: 'datetime-local', hint: 'Leave empty for now', testId: 'reading-at' },
      ]}
      submitLabel="Add reading"
      submitTestId="reading-submit"
      path="/meters/readings"
      transform={(v) => ({ meter: v.meter, kwh: Number(v.kwh), readAt: instant(v.readAt) ?? new Date().toISOString() })}
    />
  )
}

export function UploadReadings() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="u-sr"
        aria-label="Upload meter readings CSV"
        data-testid="readings-file"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setBusy(true)
          setMsg(null)
          const r = await oc<{ accepted: number }>('/meters/readings', { body: { csv: await file.text() } })
          setBusy(false)
          e.target.value = ''
          if (!r.ok) return setMsg({ ok: false, text: r.error ?? 'The upload failed.' })
          setMsg({ ok: true, text: `${r.data?.accepted ?? 0} readings added.` })
          router.refresh()
        }}
      />
      <Button variant="outline" disabled={busy} data-testid="upload-readings" onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : 'Upload CSV'}
      </Button>
      {msg && (
        <span style={{ color: msg.ok ? 'var(--ink-muted)' : 'var(--negative-ink)', fontSize: 'var(--t-ui-sm)' }} data-testid="readings-msg">
          {msg.text}
        </span>
      )}
    </span>
  )
}

/** Put a logged or metered figure into the batch's run inputs. */
export function ApplyToLedger({ path, body, label, testId }: { path: string; body?: object; label: string; testId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        data-testid={testId}
        onClick={async () => {
          setBusy(true)
          setError(null)
          const r = await oc(path, { body: body ?? {} })
          setBusy(false)
          if (!r.ok) return setError(r.error)
          router.refresh()
        }}
      >
        {busy ? 'Saving…' : label}
      </Button>
      {error && <span style={{ color: 'var(--negative-ink)', fontSize: 'var(--t-ui-sm)' }}>{error}</span>}
    </span>
  )
}
