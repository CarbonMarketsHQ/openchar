import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle } from '@/design'
import { api, type BatchRow, type Summary } from '@/lib/api'
import { statusLabel } from '@/lib/labels'
import { DataFallback, Stat, fmtDate, fmtKg } from './bits'

const STATUS_TONE = {
  open: 'info',
  sampled: 'positive',
  'awaiting-lab': 'caution',
} as const

export default async function Overview() {
  const [summary, batches] = await Promise.all([
    api<Summary>('/summary'),
    api<BatchRow[]>('/batches'),
  ])
  if (!summary || !batches) return <DataFallback />

  return (
    <>
      <div className="page-head">
        <h1>{summary.name}</h1>
        <p className="sub">
          {summary.district}. Every figure on this screen traces to a field record, a scale reading or
          a lab certificate.
        </p>
      </div>

      <div className="stat-grid">
        <Stat
          label="Creditable tonnes"
          value={summary.tonnesConservative.toFixed(2)}
          dataValue={summary.tonnesConservative}
          unit="t CO2e"
          detail="Conservative (16th percentile), sampled batches only"
        />
        <Stat label="Production batches" value={String(summary.batches)} detail={`${summary.sampledBatches} sampled and analysed`} />
        <Stat label="Consignments" value={String(summary.consignments)} detail={`From ${summary.suppliers} registered suppliers`} />
        <Stat label="Soil temperature" value={summary.tSoilC.toFixed(1)} unit="°C" detail={`${summary.district}, drives the durability factor`} />
      </div>

      <Card>
        <CardHead>
          <CardTitle desc="Production runs, newest first.">Batches</CardTitle>
        </CardHead>
        <CardBody>
          <div className="ledger-lines">
            {batches.map((b) => (
              <div className="ledger-line" key={b.id}>
                <Link
                  href={`/console/batches/${b.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '7rem 1fr auto auto',
                    gap: 'var(--sp-4)',
                    alignItems: 'center',
                    padding: 'var(--sp-3) var(--sp-4)',
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <span className="mono">{b.id}</span>
                  <span className="muted">{fmtDate(b.openedAt)} to {fmtDate(b.closedAt)}{b.biocharWetKg !== null ? ` · ${Math.round(b.biocharWetKg).toLocaleString('en-IN')} kg biochar` : ' · running'}</span>
                  <span className="mono muted">{b.sampleCount} samples</span>
                  <Badge tone={STATUS_TONE[b.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{statusLabel(b.status)}</Badge>
                </Link>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  )
}
