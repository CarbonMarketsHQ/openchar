import Link from 'next/link'
import { Card, CardBody, CardHead, CardTitle, LinkButton } from '@/design'
import { api, type BatchRow, type Consignment, type Facility, type Lot } from '@/lib/api'
import { DOC_TYPES, RECORD_LABELS, docTypeLabel, recordHref } from '@/lib/labels'
import { DataFallback } from '../bits'
import { AddDocument, type RecordOption } from './add-document'
import { DocumentCards, DocumentTable, type Doc } from './document-list'

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; record?: string }>
}) {
  const { type, record } = await searchParams
  const [data, consignments, lots, batches, facilities, dupes] = await Promise.all([
    api<{ documents: Doc[] }>('/documents'),
    api<Consignment[]>('/consignments'),
    api<Lot[]>('/lots'),
    api<BatchRow[]>('/batches'),
    api<Facility[]>('/facilities'),
    api<{ kind: string; ids: string[] }[]>('/duplicates'),
  ])
  const sameFile: Record<string, string[]> = {}
  for (const d of dupes ?? []) if (d.kind === 'file') for (const id of d.ids) sameFile[id] = d.ids
  if (!data || !consignments || !lots || !batches || !facilities) return <DataFallback />

  const records: RecordOption[] = [
    ...consignments.map((c) => ({ kind: 'consignment' as const, id: c.id, label: `${c.id} · ${c.supplierName}` })),
    ...lots.map((l) => ({ kind: 'lot' as const, id: l.id, label: `${l.id} · ${Math.round(l.hopperMassKg)} kg` })),
    ...batches.map((b) => ({ kind: 'batch' as const, id: b.id, label: b.id })),
    ...facilities.map((f) => ({ kind: 'facility' as const, id: f.id, label: f.name })),
  ]

  const all = data.documents
  const counts = new Map<string, number>()
  for (const d of all) counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
  const [recordKind, ...rest] = (record ?? '').split(':')
  const recordId = rest.join(':')
  const shown = all.filter(
    (d) =>
      (!type || d.type === type) && (!record || d.links.some((l) => l.kind === recordKind && l.id === recordId))
  )
  const filterHref = (t?: string) => {
    const q = new URLSearchParams()
    if (t) q.set('type', t)
    if (record) q.set('record', record)
    const s = q.toString()
    return s ? `/console/documents?${s}` : '/console/documents'
  }

  return (
    <>
      <div className="page-head">
        <h1>Documents</h1>
        <AddDocument records={records} />
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        Supplier declarations, land records, invoices, slips, certificates and permits, each attached
        to the consignment, lot, batch or facility it supports. A verifier opens them from the same
        records.
      </p>

      <nav className="doc-filters" aria-label="Filter by type">
        <LinkButton
          href={filterHref()}
          size="sm"
          variant={!type ? 'solid' : 'outline'}
          aria-current={!type ? 'page' : undefined}
          data-testid="doc-filter-all"
        >
          All <span className="chip-count">{all.length}</span>
        </LinkButton>
        {DOC_TYPES.filter((t) => counts.has(t.value) || t.value === type).map((t) => (
          <LinkButton
            key={t.value}
            href={filterHref(t.value)}
            size="sm"
            variant={type === t.value ? 'solid' : 'outline'}
            aria-current={type === t.value ? 'page' : undefined}
            data-testid={`doc-filter-${t.value}`}
          >
            {t.label} <span className="chip-count">{counts.get(t.value) ?? 0}</span>
          </LinkButton>
        ))}
      </nav>

      {record && (
        <p className="muted" style={{ margin: 0 }} data-testid="doc-record-filter">
          Showing documents attached to {RECORD_LABELS[recordKind]?.toLowerCase() ?? recordKind}{' '}
          <Link href={recordHref(recordKind, recordId)} className="mono">
            {recordId}
          </Link>
          . <Link href={type ? `/console/documents?type=${type}` : '/console/documents'}>Show all</Link>
        </p>
      )}

      <Card>
        <CardHead>
          <CardTitle desc="Newest first. Reference records point to a file kept in the project archive.">
            {type ? docTypeLabel(type) : 'All documents'}
          </CardTitle>
        </CardHead>
        <CardBody>
          {shown.length === 0 ? (
            <p className="muted" style={{ margin: 0 }} data-testid="doc-empty">
              {all.length === 0 ? 'No documents yet. Add the first one above.' : 'No documents match this filter.'}
            </p>
          ) : (
            <>
              <DocumentTable docs={shown} records={records} sameFile={sameFile} />
              <DocumentCards docs={shown} records={records} sameFile={sameFile} />
            </>
          )}
        </CardBody>
      </Card>
      {all.some((d) => d.links.length === 0) && (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }} data-testid="doc-unattached">
          {all.filter((d) => d.links.length === 0).length} not attached to a record yet. Use Attach so each
          one is found from the record it supports.
        </p>
      )}
    </>
  )
}
