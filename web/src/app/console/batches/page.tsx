import Link from 'next/link'
import { Badge } from '@/design'
import { api, type BatchRow, type Facility } from '@/lib/api'
import { DataFallback, fmtDate, fmtKg } from '../bits'
import { statusLabel } from '@/lib/labels'
import { OpenBatch } from './open-batch'

const STATUS_TONE = { open: 'info', sampled: 'positive', 'awaiting-lab': 'caution', closed: 'neutral' } as const

export default async function Batches() {
  const [batches, facilities] = await Promise.all([api<BatchRow[]>('/batches'), api<Facility[]>('/facilities')])
  if (!batches || !facilities) return <DataFallback />
  return (
    <>
      <div className="page-head">
        <h1>Batches</h1>
        <OpenBatch facilities={facilities} />
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        A production batch is everything the reactor turns out inside one window, never longer than a
        month. Open one for telemetry, samples and its ledger.
      </p>
      {batches.length === 0 ? (
        <div className="empty" data-testid="empty-state">
          <b>No batches yet</b>
          <span>Open the first batch when the reactor starts a run.</span>
        </div>
      ) : (
        <div className="ledger-lines">
          {batches.map((b) => (
            <div className="ledger-line" key={b.id}>
              <Link
                href={`/console/batches/${b.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '6rem 1fr auto auto auto',
                  gap: 'var(--sp-4)',
                  alignItems: 'center',
                  padding: 'var(--sp-4)',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <span className="mono">{b.id}</span>
                <span className="muted">{b.notes}</span>
                <span className="mono muted">{fmtKg(b.biocharWetKg)}</span>
                <span className="mono muted">{fmtDate(b.openedAt)}</span>
                <Badge tone={STATUS_TONE[b.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{statusLabel(b.status)}</Badge>
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
