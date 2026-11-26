'use client'

import { FormDialog } from '../form-dialog'

export function OpenBatch({ facilities }: { facilities: { id: string; name: string }[] }) {
  return (
    <FormDialog
      trigger="Open batch"
      triggerTestId="open-batch"
      title="Open a production batch"
      description="One batch is one reactor window, never longer than a month (R-6YSW-0). The facility's GPS anchors the run."
      path="/batches"
      submitLabel="Open batch"
      submitTestId="open-batch-save"
      fields={[
        { name: 'code', label: 'Batch code', required: true, placeholder: 'HT-04', hint: 'Letters, digits and hyphens.', testId: 'batch-code' },
        {
          name: 'facilityId',
          label: 'Facility',
          type: 'select',
          required: true,
          options: facilities.map((f) => ({ value: f.id, label: f.name })),
          testId: 'batch-facility',
        },
        { name: 'notes', label: 'Notes', type: 'textarea', testId: 'batch-notes' },
      ]}
      transform={(v) => ({ code: v.code, facilityId: v.facilityId, notes: v.notes })}
    />
  )
}
