'use client'

import { FormDialog } from '../../form-dialog'

export function CreateUnits({ code }: { code: string }) {
  return (
    <FormDialog
      trigger="Create units"
      triggerVariant="outline"
      triggerTestId="create-units"
      title={`Package ${code} into units`}
      description="Each unit gets a QR identity and its own custody chain through splits, merges, delivery and application."
      path={`/batches/${code}/units`}
      submitTestId="units-save"
      fields={[
        { name: 'count', label: 'Number of units', type: 'number', step: '1', min: '1', max: '200', required: true, testId: 'units-count' },
        { name: 'massKgEach', label: 'Mass per unit (kg)', type: 'number', step: '1', min: '1', required: true, testId: 'units-mass' },
        {
          name: 'kind',
          label: 'Kind',
          type: 'select',
          options: [
            { value: 'bag', label: 'Big bag' },
            { value: 'silo-lot', label: 'Silo lot' },
          ],
          defaultValue: 'bag',
          testId: 'units-kind',
        },
      ]}
      transform={(v) => ({ count: Number(v.count), massKgEach: Number(v.massKgEach), kind: v.kind })}
    />
  )
}
