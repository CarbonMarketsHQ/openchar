import { api } from '@/lib/api'
import { fuelLabel, fuelUseLabel, statusLabel } from '@/lib/labels'
import { EmptyState } from '../../../bits'
import { Facts, ReportHead, Section, Table, fmtDay, fmtNum, fmtTime, fmtVal, kg } from '../../parts'
import { PrintBar } from '../../print-bar'

type BatchReport = {
  generatedAt: string
  project: { name: string; district: string; workspace: string; synthetic: boolean }
  batch: {
    code: string
    status: string
    notes: string | null
    openedAt: string | null
    closedAt: string | null
    feedstockKg: number | null
    biocharWetKg: number | null
    biocharMoistureFrac: number | null
    durationMin: number | null
    operators: string[]
  }
  ledger: null | {
    gatePass: boolean
    grossT: number
    fDurable: number
    durableT: number
    deductionsT: number
    netMeanT: number
    netConservativeT: number
    lines: { label: string; value: number; unit: string; note: string | null }[]
    datapoints: { id: string; label: string; value: number; unit: string; sources: string }[]
    flags: string[]
  }
  lab: {
    samples: { label: string; takenAt: string; state: string; note: string | null }[]
    certificate: null | { lab: string; corgFrac: number; hCorg: number; oCorg: number; moistureFrac: number; source: string | null }
  }
  feedstock: {
    lots: { id: string; hopperKg: number; slipKg: number | null; moistureFrac: number | null }[]
    consignments: { id: string; supplier: string; estMassKg: number; moistureFrac: number | null; capturedAt: string; lot: string }[]
  }
  balance: null | { checks: { id: string; state: string; text: string }[] }
  coProducts: { kind: string; grade: string; massKg: number; fate: string }[]
  units: { id: string; kind: string; material: string; massKg: number; status: string }[]
  dispatches: { toName: string; massKg: number; dispatchedAt: string; appliedAt: string | null; farm: string | null; appliedKg: number | null }[]
  energy: { electricityKwh: number | null; fuel: { loggedAt: string; fuel: string; quantity: number; use: string; co2eKg: number }[] }
}

export default async function BatchReportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const r = await api<BatchReport>(`/reports/batch/${encodeURIComponent(code)}`)
  if (!r) return <EmptyState title={`No batch called ${code}`} />
  const l = r.ledger
  return (
    <div className="report-wrap">
      <PrintBar xlsx={`/api/oc/reports/batch/${encodeURIComponent(code)}?format=xlsx`} back={{ href: `/console/batches/${code}`, label: `Back to ${code}` }} />
      <article className="report" data-testid="batch-report">
      <ReportHead
        title={`Batch ${r.batch.code}`}
        sub={`${r.project.name}, ${r.project.district}. ${statusLabel(r.batch.status)}, opened ${fmtDay(r.batch.openedAt)}${r.batch.closedAt ? `, closed ${fmtDay(r.batch.closedAt)}` : ', still open'}.`}
        project={r.project.workspace}
        generatedAt={r.generatedAt}
        synthetic={r.project.synthetic}
      />

      <Section title="Carbon removal" testId="report-ledger">
        {l ? (
          <>
            <Facts
              items={[
                ['Gross stored', `${fmtNum(l.grossT, 3)} t CO2e`],
                ['Durable fraction', fmtNum(l.fDurable, 3)],
                ['Deductions', `${fmtNum(l.deductionsT, 3)} t CO2e`],
                ['Net removal, mean', `${fmtNum(l.netMeanT, 3)} t CO2e`],
                ['Net removal, conservative', `${fmtNum(l.netConservativeT, 3)} t CO2e`],
              ]}
            />
            <Table head={['Line', 'Value', 'Unit']} numeric={[1]} rows={l.lines.map((x) => [x.label, fmtVal(x.value), x.unit])} />
            {l.flags.length > 0 && <p className="report-note">Flags: {l.flags.join('. ')}.</p>}
          </>
        ) : (
          <p className="report-empty">The ledger needs the lab results and run inputs first.</p>
        )}
      </Section>

      {l && (
        <Section title="Datapoints and evidence">
          <Table head={['Datapoint', 'Value', 'Unit', 'Evidence']} numeric={[1]} rows={l.datapoints.map((d) => [d.label, fmtVal(d.value), d.unit, d.sources || '–'])} />
        </Section>
      )}

      <Section title="Production">
        <Facts
          items={[
            ['Feedstock, as received', kg(r.batch.feedstockKg)],
            ['Biochar, wet', kg(r.batch.biocharWetKg)],
            ['Biochar moisture', r.batch.biocharMoistureFrac === null ? '–' : `${fmtNum(r.batch.biocharMoistureFrac * 100, 1)}%`],
            ['Residence time', r.batch.durationMin === null ? '–' : `${r.batch.durationMin} min`],
            ['Electricity, metered', r.energy.electricityKwh === null ? '–' : `${fmtNum(r.energy.electricityKwh)} kWh`],
            ['Operators', r.batch.operators.length ? r.batch.operators.join(', ') : 'No shifts logged'],
          ]}
        />
        {r.balance && r.balance.checks.length > 0 && (
          <Table head={['Balance check', 'Result']} rows={r.balance.checks.map((c) => [c.text, statusLabel(c.state === 'warn' ? 'check' : c.state)])} />
        )}
      </Section>

      <Section title="Feedstock">
        <Table
          head={['Lot', 'Hopper', 'Weighbridge slip', 'Moisture']}
          numeric={[1, 2, 3]}
          rows={r.feedstock.lots.map((x) => [x.id, kg(x.hopperKg), kg(x.slipKg), x.moistureFrac === null ? '–' : `${fmtNum(x.moistureFrac * 100)}%`])}
        />
        <Table
          head={['Consignment', 'Supplier', 'Field estimate', 'Captured', 'Lot']}
          numeric={[2]}
          rows={r.feedstock.consignments.map((c) => [c.id, c.supplier, kg(c.estMassKg), fmtDay(c.capturedAt), c.lot])}
        />
      </Section>

      <Section title="Lab">
        {r.lab.certificate && (
          <Facts
            items={[
              ['Laboratory', r.lab.certificate.lab],
              ['Organic carbon', `${fmtNum(r.lab.certificate.corgFrac * 100, 1)}% of dry mass`],
              ['H/Corg', fmtNum(r.lab.certificate.hCorg, 2)],
              ['O/Corg', fmtNum(r.lab.certificate.oCorg, 2)],
              ['Certificate', r.lab.certificate.source ?? '–'],
            ]}
          />
        )}
        <Table head={['Sample', 'Taken', 'State']} rows={r.lab.samples.map((s) => [s.label, fmtDay(s.takenAt), statusLabel(s.state)])} />
      </Section>

      <Section title="Co-products, units and end use">
        <Table head={['Co-product', 'Mass', 'Fate']} numeric={[1]} rows={r.coProducts.map((c) => [`${statusLabel(c.kind)} ${c.grade}`, kg(c.massKg), c.fate])} />
        <Table head={['Unit', 'Holds', 'Mass', 'Status']} numeric={[2]} rows={r.units.map((u) => [u.id, `${statusLabel(u.material)} ${u.kind}`, kg(u.massKg), statusLabel(u.status)])} />
        <Table
          head={['Dispatched to', 'Mass', 'Dispatched', 'Applied at', 'Applied']}
          numeric={[1, 4]}
          rows={r.dispatches.map((d) => [d.toName, kg(d.massKg), fmtDay(d.dispatchedAt), d.farm ?? 'Awaiting evidence', d.appliedKg === null ? '–' : kg(d.appliedKg)])}
        />
      </Section>

      <Section title="Fuel">
        <Table
          head={['Logged', 'Fuel', 'Used for', 'Quantity', 'CO2e']}
          numeric={[3, 4]}
          rows={r.energy.fuel.map((f) => [fmtTime(f.loggedAt), fuelLabel(f.fuel), fuelUseLabel(f.use), fmtNum(f.quantity, 1), `${fmtNum(f.co2eKg, 1)} kg`])}
        />
      </Section>

      <footer className="report-foot">
        Every figure in this report comes from the records in OpenChar for batch {r.batch.code}. The ledger follows the Isometric
        Biochar Production and Storage protocol v1.3.
      </footer>
      </article>
    </div>
  )
}
