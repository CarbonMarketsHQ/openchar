import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle, KeyValues } from '@/design'
import { api } from '@/lib/api'
import { ApiDown, EmptyState } from '../../bits'
import { RECORD_LABELS, docTypeLabel, recordHref } from '@/lib/labels'

type Source = {
  id: string
  kind: string
  title: string
  ref: string | null
  note: string | null
  hasFile?: boolean
  mime?: string | null
  sizeBytes?: number | null
  sha256?: string | null
  links?: { kind: string; id: string; label?: string }[]
}

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
        <Badge>{docTypeLabel(source.kind)}</Badge>
      </div>
      <Card data-testid="source-record">
        <CardHead>
          <CardTitle desc="A document or reference record that a ledger number or a record points to. Uploaded files are stored under their SHA-256 hash.">
            {source.title}
          </CardTitle>
        </CardHead>
        <CardBody>
          <KeyValues
            items={[
              { label: 'Record id', value: <span className="mono">{source.id}</span> },
              { label: 'Type', value: docTypeLabel(source.kind) },
              {
                label: 'Attached to',
                value:
                  source.links && source.links.length > 0 ? (
                    <span className="doc-links" data-testid="source-links">
                      {source.links.map((l) => (
                        <Link key={`${l.kind}:${l.id}`} href={recordHref(l.kind, l.id)}>
                          {RECORD_LABELS[l.kind] ?? l.kind}{' '}
                          {l.kind === 'facility' ? l.label ?? l.id : <span className="mono">{l.id}</span>}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    'No record yet'
                  ),
              },
              ...(source.ref || !source.hasFile
                ? [{ label: 'File reference', value: <span className="mono">{source.ref ?? 'Held in the project profile'}</span> }]
                : []),
              { label: 'Note', value: source.note ?? '–' },
              ...(source.sha256
                ? [{ label: 'SHA-256', value: <span className="mono" style={{ overflowWrap: 'anywhere' }}>{source.sha256}</span> }]
                : []),
              {
                label: 'File',
                value: source.hasFile ? (
                  <a href={`/api/oc/sources/${source.id}/file`} data-testid="source-file">
                    Download
                    {source.sizeBytes
                      ? source.sizeBytes < 1024 * 1024
                        ? `, ${Math.max(1, Math.round(source.sizeBytes / 1024))} KB`
                        : `, ${(source.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : ''}
                    {source.mime ? ` · ${source.mime}` : ''}
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
        <Link href="/console/documents">All documents</Link> · <Link href="/console/batches">Batches</Link>
      </p>
    </>
  )
}
