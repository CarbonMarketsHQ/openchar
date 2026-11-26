'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/design'
import { oc } from '@/lib/client'
import { FormDialog } from '../../form-dialog'

export function RecordConsignmentKm({ id }: { id: string }) {
  return (
    <FormDialog
      trigger="Record"
      triggerVariant="quiet"
      triggerTestId="record-km"
      title={`Road distance for ${id}`}
      description="From the vehicle's odometer or the route driven. It replaces the estimate."
      fields={[{ name: 'km', label: 'Distance (km)', type: 'number', step: '0.1', min: '0', required: true, testId: 'km-input' }]}
      submitLabel="Save distance"
      submitTestId="km-save"
      path={`/consignments/${id}/distance`}
      method="PATCH"
      transform={(v) => ({ km: Number(v.km) })}
    />
  )
}

export function SetDelivery({ id, toName }: { id: string; toName: string }) {
  return (
    <FormDialog
      trigger="Set distance"
      triggerVariant="quiet"
      triggerTestId="set-delivery"
      title={`Delivery to ${toName}`}
      description="Give the destination's coordinates for an estimate, or the distance driven."
      fields={[
        { name: 'destLat', label: 'Latitude', type: 'number', step: 'any', min: '-90', max: '90', placeholder: '-0.152', testId: 'dest-lat' },
        { name: 'destLng', label: 'Longitude', type: 'number', step: 'any', min: '-180', max: '180', placeholder: '36.148', testId: 'dest-lng' },
        { name: 'km', label: 'Distance driven (km)', type: 'number', step: '0.1', min: '0', hint: 'Replaces the estimate when given', testId: 'dest-km' },
      ]}
      submitLabel="Save"
      submitTestId="dest-save"
      path={`/dispatches/${id}/distance`}
      method="PATCH"
      transform={(v) => ({ destLat: v.destLat, destLng: v.destLng, km: v.km })}
    />
  )
}

export function ApplyDelivery({ code, km, massT }: { code: string; km: number; massT: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        data-testid="apply-delivery"
        onClick={async () => {
          setBusy(true)
          setError(null)
          const r = await oc(`/batches/${code}/transport/apply`, { body: {} })
          setBusy(false)
          if (!r.ok) return setError(r.error)
          router.refresh()
        }}
      >
        {busy ? 'Saving…' : `Use ${km} km for ${massT} t in the ledger`}
      </Button>
      {error && <span style={{ color: 'var(--negative-ink)', fontSize: 'var(--t-ui-sm)' }}>{error}</span>}
    </span>
  )
}
