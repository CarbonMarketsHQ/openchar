import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle, Notice } from '@/design'
import { api, type BatchRow, type Summary } from '@/lib/api'
import { relativeDays, statusLabel } from '@/lib/labels'
import type { Instrument } from './calibration/page'
import { DataFallback, Stat, fmtDate, fmtKg } from './bits'

const STATUS_TONE = {
  open: 'info',
  sampled: 'positive',
  'awaiting-lab': 'caution',
} as const

export default async function Overview() {
  const [summary, batches, register] = await Promise.all([
    api<Summary>('/summary'),
    api<BatchRow[]>('/batches'),
    api<{ instruments: Instrument[] }>('/instruments'),
  ])
  const attention = (register?.instruments ?? [])
    .filter((i) => ['overdue', 'failed', 'never', 'due-soon'].includes(i.state))
    .sort((a, b) => (a.daysToDue ?? -1e9) - (b.daysToDue ?? -1e9))
  const lapsed = attention.some((i) => i.state !== 'due-soon')
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

      {attention.length > 0 && (
        <div data-testid="calibration-notice">
          <Notice tone={lapsed ? 'negative' : 'caution'} title={lapsed ? 'Calibration lapsed' : 'Calibration due soon'}>
            {attention
              .map((i) =>
                i.state === 'never'
                  ? `${i.name} has never been calibrated`
                  : i.state === 'failed'
                    ? `${i.name} failed its last calibration`
                    : `${i.name} ${i.state === 'overdue' ? 'lapsed' : 'is due'} ${relativeDays(i.daysToDue ?? 0)}`
              )
              .join('. ')}
            . <Link href="/console/calibration">Open the calibration register</Link>
          </Notice>
        </div>
      )}

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
                  <span className="muted">
                    {b.closedAt
                      ? `${fmtDate(b.openedAt)} to ${fmtDate(b.closedAt)}`
                      : `Opened ${fmtDate(b.openedAt)} · running`}
                    {b.biocharWetKg !== null ? ` · ${Math.round(b.biocharWetKg).toLocaleString('en-GB')} kg biochar` : ''}
                  </span>
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
