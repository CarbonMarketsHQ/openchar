'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/design'
import { oc } from '@/lib/client'
import { SINK_TYPES } from '@/lib/labels'
import { FormDialog } from '../../form-dialog'

export function CloseBatch({ code }: { code: string }) {
  return (
    <FormDialog
      trigger="Close batch"
      triggerTestId="close-batch"
      title={`Close batch ${code}`}
      description="Masses from the hopper and silo scales, duration from the run timer (G-7CN1-0)."
      path={`/batches/${code}`}
      method="PATCH"
      submitLabel="Close batch"
      submitTestId="close-batch-save"
      fields={[
        { name: 'feedstockMassKg', label: 'Feedstock in (kg)', type: 'number', step: '1', min: '1', required: true, testId: 'close-feedstock' },
        { name: 'biocharWetKg', label: 'Biochar out, wet (kg)', type: 'number', step: '1', min: '1', required: true, testId: 'close-biochar' },
        { name: 'biocharMoisturePct', label: 'Biochar moisture (%)', type: 'number', step: '0.5', min: '0', max: '50', required: true, testId: 'close-moisture' },
        { name: 'durationMin', label: 'Run duration (minutes)', type: 'number', step: '1', min: '1', required: true, testId: 'close-duration' },
      ]}
      transform={(v) => ({
        action: 'close',
        feedstockMassKg: Number(v.feedstockMassKg),
        biocharWetKg: Number(v.biocharWetKg),
        biocharMoistureFrac: Number(v.biocharMoisturePct) / 100,
        durationMin: Number(v.durationMin),
      })}
    />
  )
}

export function UploadTelemetry({ code }: { code: string }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="u-sr"
        aria-label="Upload temperature CSV"
        data-testid="telemetry-file"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setBusy(true)
          setError(null)
          const csv = await file.text()
          const r = await oc(`/batches/${code}/telemetry`, { body: { csv } })
          setBusy(false)
          e.target.value = ''
          if (!r.ok) return setError(r.error)
          router.refresh()
        }}
      />
      <Button variant="outline" disabled={busy} data-testid="upload-telemetry" onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : 'Upload temperature CSV'}
      </Button>
      {error && <span style={{ color: 'var(--negative-ink)', fontSize: 'var(--t-ui-sm)' }}>{error}</span>}
    </span>
  )
}

export function RegisterSamples({ code }: { code: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="outline"
      disabled={busy}
      data-testid="register-samples"
      onClick={async () => {
        setBusy(true)
        await oc(`/batches/${code}/samples`, { body: {} })
        setBusy(false)
        router.refresh()
      }}
    >
      {busy ? 'Registering…' : 'Register 3 samples'}
    </Button>
  )
}

export function EnterCertificate({ code }: { code: string }) {
  return (
    <FormDialog
      trigger="Enter lab certificate"
      triggerTestId="enter-certificate"
      title={`Lab certificate for ${code}`}
      description="Values from the accredited lab report. H/Corg and O/Corg decide durability eligibility."
      path={`/batches/${code}/certificate`}
      submitLabel="Save certificate"
      submitTestId="certificate-save"
      fields={[
        { name: 'lab', label: 'Laboratory', required: true, placeholder: 'ISO/IEC 17025 accredited laboratory', testId: 'cert-lab' },
        { name: 'corgPct', label: 'Organic carbon (% of dry mass)', type: 'number', step: '0.1', min: '1', max: '100', required: true, testId: 'cert-corg' },
        { name: 'hCorg', label: 'H/Corg molar ratio', type: 'number', step: '0.01', min: '0', max: '2', required: true, hint: 'Must be below 0.5 for durability eligibility.', testId: 'cert-hcorg' },
        { name: 'oCorg', label: 'O/Corg molar ratio', type: 'number', step: '0.01', min: '0', max: '1', required: true, hint: 'Must be below 0.2.', testId: 'cert-ocorg' },
        { name: 'moisturePct', label: 'Moisture (%)', type: 'number', step: '0.5', min: '0', max: '50', required: true, testId: 'cert-moisture' },
      ]}
      transform={(v) => ({
        lab: v.lab,
        corgFrac: Number(v.corgPct) / 100,
        hCorg: Number(v.hCorg),
        oCorg: Number(v.oCorg),
        moistureFrac: Number(v.moisturePct) / 100,
      })}
    />
  )
}

export function EditOps({ code, existing }: { code: string; existing: { transportKm: number; transportMassT: number; electricityKwh: number } | null }) {
  return (
    <FormDialog
      trigger={existing ? 'Edit run inputs' : 'Record run inputs'}
      triggerVariant="outline"
      triggerTestId="edit-ops"
      title={`Run inputs for ${code}`}
      description="Transport and energy for the deduction side of the ledger."
      path={`/batches/${code}/ops`}
      method="PUT"
      submitTestId="ops-save"
      fields={[
        { name: 'transportKm', label: 'Feedstock transport distance (km)', type: 'number', step: '1', min: '0', required: true, defaultValue: existing ? String(existing.transportKm) : undefined, testId: 'ops-km' },
        { name: 'transportMassT', label: 'Transported mass (t)', type: 'number', step: '0.01', min: '0', required: true, defaultValue: existing ? String(existing.transportMassT) : undefined, testId: 'ops-mass' },
        { name: 'electricityKwh', label: 'Plant electricity for the run (kWh)', type: 'number', step: '1', min: '0', required: true, defaultValue: existing ? String(existing.electricityKwh) : undefined, testId: 'ops-kwh' },
      ]}
      transform={(v) => ({
        transportKm: Number(v.transportKm),
        transportMassT: Number(v.transportMassT),
        electricityKwh: Number(v.electricityKwh),
      })}
    />
  )
}

export function AddCoProduct({ code }: { code: string }) {
  return (
    <FormDialog
      trigger="Declare co-product"
      triggerVariant="outline"
      triggerTestId="add-co-product"
      title={`Co-product from ${code}`}
      description="Every co-product and its fate, declared (R-3MBJ-0). Mass routed to activation earns no credits."
      path={`/batches/${code}/co-products`}
      submitTestId="co-product-save"
      fields={[
        {
          name: 'kind',
          label: 'Kind',
          type: 'select',
          options: [
            { value: 'bio-liquid', label: 'Bio-liquid' },
            { value: 'biochar', label: 'Biochar (non-credit route)' },
            { value: 'syngas', label: 'Syngas' },
          ],
          testId: 'cp-kind',
        },
        { name: 'grade', label: 'Grade or stream', required: true, placeholder: '1, 2, 3, activation-trial…', testId: 'cp-grade' },
        { name: 'massKg', label: 'Mass (kg)', type: 'number', step: '1', min: '0', required: true, testId: 'cp-mass' },
        { name: 'fate', label: 'Fate', required: true, placeholder: 'Wood vinegar for agriculture / process heat / excluded from crediting', testId: 'cp-fate' },
      ]}
      transform={(v) => ({ kind: v.kind, grade: v.grade, massKg: Number(v.massKg), fate: v.fate })}
    />
  )
}

export function NewDispatch({ code }: { code: string }) {
  return (
    <FormDialog
      trigger="Record dispatch"
      triggerVariant="outline"
      triggerTestId="new-dispatch"
      title={`Dispatch from ${code}`}
      description="Biochar leaving the silo. Credits need the application evidence that follows."
      path="/dispatches"
      submitTestId="dispatch-save"
      fields={[
        { name: 'toName', label: 'Dispatched to', required: true, testId: 'dispatch-to' },
        { name: 'massKg', label: 'Mass (kg)', type: 'number', step: '1', min: '1', required: true, testId: 'dispatch-mass' },
      ]}
      transform={(v) => ({ batchCode: code, toName: v.toName, massKg: Number(v.massKg) })}
    />
  )
}

export function RecordApplication({ dispatchId }: { dispatchId: string }) {
  return (
    <FormDialog
      trigger="Record application"
      triggerVariant="outline"
      triggerTestId="record-application"
      title="Soil application"
      description="Where the biochar went into the ground. This is what turns stored carbon into a creditable removal."
      path="/applications"
      submitTestId="application-save"
      fields={[
        { name: 'farmName', label: 'Farm or site', required: true, testId: 'app-farm' },
        { name: 'areaHa', label: 'Area (ha)', type: 'number', step: '0.1', min: '0.1', required: true, testId: 'app-area' },
        { name: 'appliedMassKg', label: 'Applied mass (kg)', type: 'number', step: '1', min: '1', required: true, testId: 'app-mass' },
        { name: 'sink', label: 'Sink', type: 'select', defaultValue: 'soil', options: SINK_TYPES, hint: 'Only soil storage is credited by this ledger version', testId: 'app-sink' },
      ]}
      transform={(v) => ({
        dispatchId,
        farmName: v.farmName,
        areaHa: Number(v.areaHa),
        appliedMassKg: Number(v.appliedMassKg),
        sink: v.sink || 'soil',
      })}
    />
  )
}
