import Link from 'next/link'
import { api } from '@/lib/api'
import { causeLabel, fmtCo2e, fmtDuration, fuelLabel, fuelUseLabel, statusLabel } from '@/lib/labels'
import { EmptyState } from '../../../bits'
import { Facts, ReportHead, Section, Table, fmtDay, fmtNum, fmtTime, fmtVal, kg } from '../../parts'
import { PrintBar } from '../../print-bar'

type MonthReport = {
  generatedAt: string
  project: { name: string; district: string; workspace: string; synthetic: boolean }
  month: string
  intake: { consignments: number; estMassKg: number }
  batches: { code: string; status: string; openedAt: string; closedAt: string | null; feedstockKg: number | null; biocharWetKg: number | null; netConservativeT: number | null }[]
  emissions: { scope1T: number; scope2T: number; scope3T: number }
  fuel: { loggedAt: string; batch: string | null; fuel: string; quantity: number; use: string; vehicle: string | null; co2eKg: number }[]
  shifts: { operator: string; startedAt: string; endedAt: string | null; minutes: number | null; handover: string | null }[]
  downtime: { cause: string; startedAt: string; endedAt: string | null; minutes: number | null; note: string | null }[]
  calibrations: { instrument: string; calibratedOn: string; result: string; by: string }[]
}

export default async function MonthReportPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params
  const r = await api<MonthReport>(`/reports/month/${encodeURIComponent(month)}`)
  if (!r) return <EmptyState title={`No report for ${month}`} />
  const name = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const downMin = r.downtime.reduce((n, d) => n + (d.minutes ?? 0), 0)
  return (
    <div className="report-wrap">
      <PrintBar xlsx={`/api/oc/reports/month/${month}?format=xlsx`} back={{ href: '/console/reports', label: 'All reports' }} />
      <article className="report" data-testid="month-report">
      <ReportHead
        title={name}
        sub={`Monthly report for ${r.project.name}, ${r.project.district}.`}
        project={r.project.workspace}
        generatedAt={r.generatedAt}
        synthetic={r.project.synthetic}
      />

      <Section title="The month at a glance" testId="report-month-summary">
        <Facts
          items={[
            ['Consignments received', `${r.intake.consignments}, ${fmtNum(r.intake.estMassKg)} kg by field estimate`],
            ['Batches opened or closed', String(r.batches.length)],
            ['Scope 1', fmtCo2e(r.emissions.scope1T)],
            ['Scope 2', fmtCo2e(r.emissions.scope2T)],
            ['Scope 3', fmtCo2e(r.emissions.scope3T)],
            ['Downtime', downMin ? fmtDuration(downMin) : 'None logged'],
          ]}
        />
      </Section>

      <Section title="Batches">
        <Table
          head={['Batch', 'Status', 'Opened', 'Closed', 'Feedstock', 'Biochar, wet', 'Net, conservative']}
          numeric={[4, 5, 6]}
          rows={r.batches.map((b) => [
            <Link key={b.code} href={`/console/reports/batch/${b.code}`}>
              {b.code}
            </Link>,
            statusLabel(b.status),
            fmtDay(b.openedAt),
            fmtDay(b.closedAt),
            kg(b.feedstockKg),
            kg(b.biocharWetKg),
            b.netConservativeT === null ? '–' : `${fmtNum(b.netConservativeT, 3)} t CO2e`,
          ])}
        />
      </Section>

      <Section title="Shifts">
        <Table head={['Operator', 'Started', 'Length', 'Handover']} rows={r.shifts.map((s) => [s.operator, fmtTime(s.startedAt), s.minutes === null ? 'On shift' : fmtDuration(s.minutes), s.handover ?? '–'])} />
      </Section>

      <Section title="Downtime">
        <Table head={['Cause', 'Started', 'Length', 'Note']} rows={r.downtime.map((d) => [causeLabel(d.cause), fmtTime(d.startedAt), d.minutes === null ? 'Still down' : fmtDuration(d.minutes), d.note ?? '–'])} />
      </Section>

      <Section title="Fuel">
        <Table
          head={['Logged', 'Fuel', 'Used for', 'Batch or vehicle', 'Quantity', 'CO2e']}
          numeric={[4, 5]}
          rows={r.fuel.map((f) => [fmtTime(f.loggedAt), fuelLabel(f.fuel), fuelUseLabel(f.use), f.batch ?? f.vehicle ?? '–', fmtNum(f.quantity, 1), `${fmtNum(f.co2eKg, 1)} kg`])}
        />
      </Section>

      <Section title="Calibrations">
        <Table head={['Instrument', 'Calibrated', 'Result', 'By']} rows={r.calibrations.map((c) => [c.instrument, fmtDay(c.calibratedOn), statusLabel(c.result), c.by])} />
      </Section>

      <footer className="report-foot">Every figure in this report comes from the records in OpenChar for {name}.</footer>
      </article>
    </div>
  )
}
