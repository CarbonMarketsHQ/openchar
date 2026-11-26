'use client'

import { FormDialog } from '../../form-dialog'

export function SplitUnit({ unitId, massKg }: { unitId: string; massKg: number }) {
  return (
    <FormDialog
      trigger="Split"
      triggerVariant="outline"
      triggerTestId="unit-split"
      title={`Split ${unitId}`}
      description={`The unit holds ${Math.round(massKg)} kg; the parts must balance within 2%.`}
      path={`/units/${unitId}/split`}
      submitTestId="unit-split-save"
      fields={[
        {
          name: 'masses',
          label: 'Part masses (kg, comma separated)',
          required: true,
          placeholder: '250, 250',
          testId: 'unit-split-masses',
        },
      ]}
      transform={(v) => ({ masses: v.masses.split(',').map((m) => Number(m.trim())).filter((m) => m > 0) })}
    />
  )
}

export function MergeUnit({ unitId, candidates }: { unitId: string; candidates: { id: string; massKg: number }[] }) {
  if (candidates.length === 0) return null
  return (
    <FormDialog
      trigger="Merge with…"
      triggerVariant="outline"
      triggerTestId="unit-merge"
      title={`Merge ${unitId}`}
      description="Combines two in-storage units into one, keeping both as parents in the lineage."
      path="/units/merge"
      submitTestId="unit-merge-save"
      fields={[
        {
          name: 'other',
          label: 'Merge with',
          type: 'select',
          required: true,
          options: candidates.map((c) => ({ value: c.id, label: `${c.id} · ${Math.round(c.massKg)} kg` })),
          testId: 'unit-merge-other',
        },
      ]}
      transform={(v) => ({ unitIds: [unitId, v.other] })}
    />
  )
}

export function DeliverUnit({ unitId }: { unitId: string }) {
  return (
    <FormDialog
      trigger="Deliver"
      triggerVariant="outline"
      triggerTestId="unit-deliver"
      title={`Deliver ${unitId}`}
      path={`/units/${unitId}/deliver`}
      submitTestId="unit-deliver-save"
      fields={[{ name: 'toName', label: 'Delivered to', required: true, testId: 'unit-deliver-to' }]}
    />
  )
}

export function ApplyUnit({ unitId }: { unitId: string }) {
  return (
    <FormDialog
      trigger="Record application"
      triggerTestId="unit-apply"
      title={`Apply ${unitId} to soil`}
      description="Closes the unit's custody chain at the farm."
      path={`/units/${unitId}/apply`}
      submitTestId="unit-apply-save"
      fields={[{ name: 'farmName', label: 'Farm or site', required: true, testId: 'unit-apply-farm' }]}
    />
  )
}
