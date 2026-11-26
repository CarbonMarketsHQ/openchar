'use client'

import { FormDialog } from '../form-dialog'
import type { RecordOption } from './add-document'

/** Attach an existing document to one more consignment, lot or batch. */
export function AttachDocument({ docId, title, records }: { docId: string; title: string; records: RecordOption[] }) {
  return (
    <FormDialog
      trigger="Attach"
      triggerVariant="quiet"
      triggerTestId="doc-attach"
      title="Attach to a record"
      description={title}
      fields={[
        {
          name: 'record',
          label: 'Record',
          type: 'select',
          required: true,
          testId: 'doc-attach-record',
          options: records.map((r) => ({ value: `${r.kind}:${r.id}`, label: r.label })),
        },
      ]}
      submitLabel="Attach"
      submitTestId="doc-attach-submit"
      path={`/documents/${docId}/links`}
      transform={(v) => {
        const [kind, ...rest] = v.record.split(':')
        return { kind, id: rest.join(':') }
      }}
    />
  )
}
