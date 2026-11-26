import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle, KeyValues } from '@/design'
import { api } from '@/lib/api'
import { ApiDown, EmptyState } from '../../bits'

type Source = { id: string; kind: string; title: string; ref: string | null; note: string | null; hasFile?: boolean; mime?: string | null; sizeBytes?: number | null }

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const source = await api<Source>(`/sources/${encodeURIComponent(id)}`)
  if (source === null) {
    const health = await api<{ ok: boolean }>('/health')
    if (!health) return <ApiDown />
    return <EmptyState title={`No evidence record called ${id}`} />
  }
  return (
    <>
      <div className="page-head">
        <h1>Evidence</h1>
        <Badge>{source.kind}</Badge>
      </div>
      <Card data-testid="source-record">
        <CardHead>
          <CardTitle desc="The record a ledger number resolves to. In production this holds the file itself, content-addressed.">
            {source.title}
          </CardTitle>
        </CardHead>
        <CardBody>
          <KeyValues
            items={[
              { label: 'Record id', value: <span className="mono">{source.id}</span> },
              { label: 'Kind', value: source.kind },
              { label: 'File reference', value: <span className="mono">{source.ref ?? 'held in the project profile'}</span> },
              { label: 'Note', value: source.note ?? '–' },
              {
                label: 'File',
                value: source.hasFile ? (
                  <a href={`/api/oc/sources/${source.id}/file`} data-testid="source-file">
                    Download ({source.mime ?? 'file'}
                    {source.sizeBytes ? `, ${Math.round(source.sizeBytes / 1024)} KB` : ''})
                  </a>
                ) : (
                  'Reference record; file lives with the project archive'
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
      <p className="muted" style={{ margin: 0, fontSize: 'var(--t-caption)' }}>
        Reached from a ledger line? <Link href="/console/batches">Back to batches</Link>
      </p>
    </>
  )
}
