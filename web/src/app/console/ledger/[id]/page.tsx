import Link from 'next/link'
import { Card, CardBody, CardHead, CardTitle, Notice } from '@/design'
import { api, type LedgerBundle } from '@/lib/api'
import { ApiDown, EmptyState, Stat } from '../../bits'
import { DurabilityCurve } from './curve'
import { LedgerLines } from './lines'

export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bundle = await api<LedgerBundle>(`/batches/${encodeURIComponent(id)}/ledger`)
  if (bundle === null) {
    const health = await api<{ ok: boolean }>('/health')
    if (!health) return <ApiDown />
    return (
      <EmptyState title={`No ledger for ${id}`}>
        A batch gets a ledger once it is closed and its lab certificate is in.{' '}
        <Link href="/console/batches">Back to batches</Link>
      </EmptyState>
    )
  }
  const r = bundle.result

  return (
    <>
      <div className="page-head">
        <h1>
          Ledger · <span className="mono">{r.batchId}</span>
        </h1>
        <p className="sub">
          Net removal, computed clause by clause from the Isometric biochar protocol. Every line
          opens to the datapoints it consumed, and every datapoint names its evidence.
        </p>
      </div>

      {r.flags.map((f) => (
        <Notice key={f} tone="negative" title="Flag">
          {f}
        </Notice>
      ))}

      <div className="stat-grid">
        <Stat
          label="Gross stored"
          value={r.grossT.toFixed(3)}
          dataValue={r.grossT}
          unit="t CO2e"
          detail={`± ${r.grossSigmaT.toFixed(3)} t at one standard deviation`}
          testId="ledger-gross"
        />
        <Stat
          label="Durable fraction"
          value={r.fDurable.toFixed(3)}
          dataValue={r.fDurable}
          detail={`200-year basis at ${r.tUsedC.toFixed(1)}°C soil`}
          testId="ledger-fdurable"
        />
        <Stat
          label="Deductions"
          value={r.deductionsT.toFixed(3)}
          dataValue={r.deductionsT}
          unit="t CO2e"
          detail="Transport and plant electricity"
          testId="ledger-deductions"
        />
        <Stat
          label="Creditable"
          value={r.netConservativeT.toFixed(3)}
          dataValue={r.netConservativeT}
          unit="t CO2e"
          detail={`Conservative; the mean is ${r.netMeanT.toFixed(3)} t`}
          testId="ledger-net-conservative"
        />
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-5)', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', alignItems: 'start' }}>
        <Card>
          <CardHead>
            <CardTitle desc="Click a line to walk it back to its evidence.">The calculation</CardTitle>
          </CardHead>
          <CardBody>
            <LedgerLines bundle={bundle} />
          </CardBody>
        </Card>
        <Card>
          <CardHead>
            <CardTitle desc="Warm soils punish hydrogen-rich char; a lower H/Corg is worth real tonnes.">
              What H/Corg is worth here
            </CardTitle>
          </CardHead>
          <CardBody>
            <DurabilityCurve tSoilC={r.tUsedC} hCorg={bundle.datapoints.find((d) => d.id === 'hcorg')?.value ?? 0} f={r.fDurable} />
            <div style={{ marginTop: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-2)' }}>
              <span className="section-title" style={{ margin: 0, fontSize: 'var(--t-ui)' }}>
                Assumptions on the record
              </span>
              {bundle.assumptions.map((a) => (
                <p key={a} className="muted" style={{ margin: 0, fontSize: 'var(--t-caption)' }}>
                  {a}
                </p>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
