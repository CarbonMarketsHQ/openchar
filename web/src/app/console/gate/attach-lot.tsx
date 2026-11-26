'use client'

import { FormDialog } from '../form-dialog'

export function AttachLot({ lotId, batchCodes }: { lotId: string; batchCodes: string[] }) {
  if (batchCodes.length === 0) return null
  return (
    <FormDialog
      trigger="Attach to batch"
      triggerVariant="outline"
      title={`Attach ${lotId} to a batch`}
      description="Links the intake lot's masses to the production run that consumed it."
      path={`/lots/${lotId}`}
      method="PATCH"
      submitLabel="Attach"
      fields={[
        {
          name: 'batchCode',
          label: 'Batch',
          type: 'select',
          required: true,
          options: batchCodes.map((c) => ({ value: c, label: c })),
          testId: 'attach-batch',
        },
      ]}
    />
  )
}
