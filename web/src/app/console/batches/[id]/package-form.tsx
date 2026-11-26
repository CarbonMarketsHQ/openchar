'use client'

import { CONTAINERS } from '@/lib/labels'
import { FormDialog } from '../../form-dialog'

/** Package a co-product stream into QR-labelled containers. */
export function PackageCoProduct({ id, label, leftKg }: { id: string; label: string; leftKg: number }) {
  return (
    <FormDialog
      trigger="Package"
      triggerVariant="quiet"
      triggerTestId="package-co-product"
      title={`Package ${label}`}
      description={`${Math.round(leftKg)} kg of this stream is not yet in containers. Each container gets its own QR label and custody chain.`}
      fields={[
        { name: 'kind', label: 'Container', type: 'select', required: true, options: CONTAINERS, testId: 'package-kind' },
        { name: 'count', label: 'How many', type: 'number', step: '1', min: '1', max: '200', required: true, defaultValue: '1', testId: 'package-count' },
        { name: 'massKgEach', label: 'Mass in each (kg)', type: 'number', step: '0.1', min: '0.1', required: true, testId: 'package-mass' },
      ]}
      submitLabel="Create containers"
      submitTestId="package-submit"
      path={`/co-products/${id}/units`}
      transform={(v) => ({ kind: v.kind, count: Number(v.count), massKgEach: Number(v.massKgEach) })}
    />
  )
}
