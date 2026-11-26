import Link from 'next/link'
import { Card, CardBody, CardHead, CardTitle, LinkButton } from '@/design'
import { api, type BatchRow } from '@/lib/api'
import { statusLabel } from '@/lib/labels'
import { DataFallback, fmtDate } from '../bits'

export default async function ReportsPage() {
  const batches = await api<BatchRow[]>('/batches')
  if (!batches) return <DataFallback />
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7))
  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        A report for each batch and each month. Open one to read or save it as PDF, or download it as an Excel workbook.
      </p>
      <div className="shift-now">
        <Card>
          <CardHead>
            <CardTitle desc="The ledger, its evidence, feedstock, lab, units and fuel.">Batch reports</CardTitle>
          </CardHead>
          <CardBody>
            <ul className="report-list">
              {batches.map((b) => (
                <li key={b.id} data-testid="report-batch-row">
                  <Link href={`/console/reports/batch/${b.id}`} className="mono">
                    {b.id}
                  </Link>
                  <span className="muted">
                    {statusLabel(b.status)}, opened {fmtDate(b.openedAt)}
                  </span>
                  <LinkButton href={`/api/oc/reports/batch/${b.id}?format=xlsx`} variant="quiet" download>
                    Excel
                  </LinkButton>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHead>
            <CardTitle desc="Intake, batches, emissions, shifts, downtime, fuel and calibrations.">Monthly reports</CardTitle>
          </CardHead>
          <CardBody>
            <ul className="report-list">
              {months.map((m) => (
                <li key={m} data-testid="report-month-row">
                  <Link href={`/console/reports/month/${m}`}>
                    {new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                  </Link>
                  <span />
                  <LinkButton href={`/api/oc/reports/month/${m}?format=xlsx`} variant="quiet" download>
                    Excel
                  </LinkButton>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
