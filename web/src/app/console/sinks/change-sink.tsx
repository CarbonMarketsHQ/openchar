'use client'

import { SINK_TYPES } from '@/lib/labels'
import { FormDialog } from '../form-dialog'

export function ChangeSink({ id, sink }: { id: string; sink: string }) {
  return (
    <FormDialog
      trigger="Change"
      triggerVariant="quiet"
      triggerTestId="change-sink"
      title="Where this biochar went"
      description="Only soil storage is credited by this ledger version."
      fields={[{ name: 'sink', label: 'Sink', type: 'select', required: true, defaultValue: sink, options: SINK_TYPES, testId: 'sink-select' }]}
      submitLabel="Save"
      submitTestId="sink-save"
      path={`/applications/${id}/sink`}
      method="PATCH"
    />
  )
}
