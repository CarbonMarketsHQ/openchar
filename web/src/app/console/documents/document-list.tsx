import Link from 'next/link'
import { Badge } from '@/design'
import { IconFile } from '@/design/icons'
import { RECORD_LABELS, docTypeLabel, recordHref } from '@/lib/labels'
import { fmtDate } from '../bits'
import type { RecordOption } from './add-document'
import { AttachDocument } from './attach-document'

export type Doc = {
  id: string
  type: string
  title: string
  note: string | null
  hasFile: boolean
  mime: string | null
  sizeBytes: number | null
  sha256: string | null
  createdAt: string
  links: { kind: string; id: string; label?: string }[]
}

function fmtSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileCell({ doc }: { doc: Doc }) {
  return doc.hasFile ? (
    <a href={`/api/oc/sources/${doc.id}/file`} data-testid="doc-download">
      Download{doc.sizeBytes !== null ? `, ${fmtSize(doc.sizeBytes)}` : ''}
    </a>
  ) : (
    <span className="muted">Reference record</span>
  )
}

/** The records a document supports, and the control to add one more. */
function Links({ doc, records }: { doc: Doc; records: RecordOption[] }) {
  return (
    <span className="doc-links">
      {doc.links.length === 0 && (
        <Badge tone="caution" variant="dashed">
          Not attached
        </Badge>
      )}
      {doc.links.map((l) => (
        <Link key={`${l.kind}:${l.id}`} href={recordHref(l.kind, l.id)} data-testid="doc-link">
          {RECORD_LABELS[l.kind] ?? l.kind}{' '}
                          {l.kind === 'facility' ? l.label ?? l.id : <span className="mono">{l.id}</span>}
        </Link>
      ))}
      <AttachDocument docId={doc.id} title={doc.title} records={records} />
    </span>
  )
}

/** Every document with its type, the records it supports and its file. */
export function DocumentTable({ docs, records }: { docs: Doc[]; records: RecordOption[] }) {
  return (
    <div className="ui-tablewrap doc-table">
      <table className="ui-table">
        <caption className="u-sr">Documents</caption>
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Type</th>
            <th scope="col">Attached to</th>
            <th scope="col">Added</th>
            <th scope="col">File</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} data-testid="doc-row">
              <td>
                <Link href={`/console/sources/${d.id}`} data-testid="doc-title-link">
                  {d.title}
                </Link>
                {d.sha256 && (
                  <div className="mono muted" style={{ fontSize: 'var(--t-caption)' }} title={`SHA-256 ${d.sha256}`}>
                    sha256 {d.sha256.slice(0, 12)}
                  </div>
                )}
              </td>
              <td>
                <Badge data-testid="doc-type-badge">{docTypeLabel(d.type)}</Badge>
              </td>
              <td>
                <Links doc={d} records={records} />
              </td>
              <td>{fmtDate(d.createdAt)}</td>
              <td>
                <FileCell doc={d} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The compact list a record's own page shows. */
export function DocumentList({ docs }: { docs: Doc[] }) {
  return (
    <div className="doc-list">
      {docs.map((d) => (
        <div key={d.id} className="doc-row" data-testid="record-doc">
          <IconFile size={16} aria-hidden="true" />
          <div className="doc-row-title">
            <Link href={`/console/sources/${d.id}`}>{d.title}</Link>
            <span className="muted" style={{ fontSize: 'var(--t-caption)' }}>
              {docTypeLabel(d.type)} · {fmtDate(d.createdAt)}
            </span>
          </div>
          <span style={{ fontSize: 'var(--t-ui-sm)' }}>
            <FileCell doc={d} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** The same documents as cards, for phone widths where the table is too narrow. */
export function DocumentCards({ docs, records }: { docs: Doc[]; records: RecordOption[] }) {
  return (
    <div className="doc-cards">
      {docs.map((d) => (
        <article key={d.id} className="doc-card" data-testid="doc-card">
          <div className="doc-card-head">
            <Link href={`/console/sources/${d.id}`}>{d.title}</Link>
            <Badge>{docTypeLabel(d.type)}</Badge>
          </div>
          <Links doc={d} records={records} />
          <div className="doc-card-foot muted">
            <span>Added {fmtDate(d.createdAt)}</span>
            <FileCell doc={d} />
          </div>
        </article>
      ))}
    </div>
  )
}
