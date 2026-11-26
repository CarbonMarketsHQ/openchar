import Link from 'next/link'
import { Card, CardBody, CardHead, CardTitle, LinkButton } from '@/design'
import { api } from '@/lib/api'
import { fmtCo2e } from '@/lib/labels'
import { DataFallback } from '../bits'
import { ScopeChart } from './chart'

type Scopes = { scope1: number; scope2: number; scope3: number }
type Emissions = {
  months: ({ month: string } & Scopes)[]
  totals: Scopes
  total: number
  sources: { source: string; scope: 1 | 2 | 3; co2eT: number }[]
  batches: ({ code: string; status: string; total: number; electricityMeasured: boolean; dryBiocharT: number | null; perDryTonne: number | null } & Scopes)[]
  notes: { gridFactor: number; freightFactor: number; gridKwh: number; biogenicFuelKg: number; legsWithoutDistance: number }
}

/** 0.2466 → ["247", "kg CO2e"], 2.4 → ["2.40", "t CO2e"]. */
function parts(t: number): [string, string] {
  return t < 1 ? [Math.round(t * 1000).toLocaleString('en-GB'), 'kg CO2e'] : [t.toFixed(2), 't CO2e']
}

const SCOPES = [
  { key: 'scope1', n: 1, title: 'Scope 1', desc: 'Fuel burned at the plant and in its vehicles' },
  { key: 'scope2', n: 2, title: 'Scope 2', desc: 'Grid electricity' },
  { key: 'scope3', n: 3, title: 'Scope 3', desc: 'Feedstock collection and biochar delivery by road' },
] as const

export default async function EmissionsPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const { months: m } = await searchParams
  const months = [3, 6, 12].includes(Number(m)) ? Number(m) : 6
  const data = await api<Emissions>(`/emissions?months=${months}`)
  if (!data) return <DataFallback />
  const peak = Math.max(...data.months.map((x) => x.scope1 + x.scope2 + x.scope3))
  const unit = peak < 1 ? 'kg' : 't'
  const share = (t: number) => (data.total > 0 ? Math.round((t / data.total) * 100) : 0)

  return (
    <>
      <div className="page-head">
        <h1>Emissions</h1>
        <nav className="doc-filters" aria-label="Period">
          {[3, 6, 12].map((n) => (
            <LinkButton
              key={n}
              href={`/console/emissions?months=${n}`}
              size="sm"
              variant={n === months ? 'solid' : 'outline'}
              aria-current={n === months ? 'page' : undefined}
              data-testid={`period-${n}`}
            >
              {n} months
            </LinkButton>
          ))}
        </nav>
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        The plant&rsquo;s own emissions from its fuel log, electricity meters and road distances, by scope. This is an
        operating view. A batch&rsquo;s ledger counts only what you applied to its run inputs.
      </p>

      <div className="stat-grid" data-testid="scope-totals">
        {SCOPES.map((s) => {
          const [num, u] = parts(data.totals[s.key])
          return (
            <div className="stat" key={s.key} data-testid={`total-${s.key}`}>
              <span className="k" data-stamp>
                <span className={`scope-key scope-${s.key}`} aria-hidden="true" /> {s.title}
              </span>
              <span className="v" data-value={data.totals[s.key]}>
                {num}
                <small> {u}</small>
              </span>
              <span className="d">{s.desc}</span>
            </div>
          )
        })}
        <div className="stat" data-testid="total-all">
          <span className="k" data-stamp>
            All scopes
          </span>
          <span className="v" data-value={data.total}>
            {parts(data.total)[0]}
            <small> {parts(data.total)[1]}</small>
          </span>
          <span className="d">Last {months} months</span>
        </div>
      </div>

      <Card>
        <CardHead>
          <CardTitle desc="Stacked by scope. Hover a bar for its value.">By month</CardTitle>
        </CardHead>
        <CardBody>
          <ScopeChart months={data.months} unit={unit} />
          <ul className="scope-legend" aria-label="Legend">
            {SCOPES.map((s) => (
              <li key={s.key}>
                <span className={`scope-key scope-${s.key}`} aria-hidden="true" /> {s.title}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <div className="emissions-split">
        <Card>
          <CardHead>
            <CardTitle desc="Largest first, over the period.">By source</CardTitle>
          </CardHead>
          <CardBody>
            {data.sources.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nothing logged in this period.
              </p>
            ) : (
              <ul className="cause-bars" aria-label="Emissions by source">
                {data.sources.map((s) => (
                  <li key={s.source} data-testid="source-row">
                    <span className="cause-name">
                      {s.source} <span className="muted">· scope {s.scope}</span>
                    </span>
                    <span className="cause-track" aria-hidden="true">
                      <span className={`cause-fill scope-fill-${s.scope}`} style={{ width: `${s.co2eT > 0 ? Math.max(0.8, (s.co2eT / data.total) * 100) : 0}%` }} />
                    </span>
                    <span className="cause-min num">{fmtCo2e(s.co2eT)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead>
            <CardTitle desc="Each batch's fuel, metered electricity and road legs, per dry tonne of biochar.">By batch</CardTitle>
          </CardHead>
          <CardBody>
            <div className="ui-tablewrap">
              <table className="ui-table shift-table">
                <caption className="u-sr">Emissions by batch</caption>
                <thead>
                  <tr>
                    <th scope="col">Batch</th>
                    <th scope="col" data-numeric>
                      Scope 1
                    </th>
                    <th scope="col" data-numeric>
                      Scope 2
                    </th>
                    <th scope="col" data-numeric>
                      Scope 3
                    </th>
                    <th scope="col" data-numeric>
                      Per dry t
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.batches.map((b) => (
                    <tr key={b.code} data-testid="emissions-batch-row">
                      <td>
                        <Link href={`/console/batches/${b.code}`} className="mono">
                          {b.code}
                        </Link>
                      </td>
                      <td data-numeric>{fmtCo2e(b.scope1)}</td>
                      <td data-numeric>{b.electricityMeasured ? fmtCo2e(b.scope2) : <span className="muted">Open</span>}</td>
                      <td data-numeric>{fmtCo2e(b.scope3)}</td>
                      <td data-numeric>{b.perDryTonne === null ? <span className="muted">–</span> : fmtCo2e(b.perDryTonne)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 'var(--t-caption)', maxWidth: 'var(--measure)' }} data-testid="emissions-notes">
        Grid factor {data.notes.gridFactor * 1000} kg CO2e per kWh, set on the Projects page ({data.notes.gridKwh.toLocaleString('en-GB')} kWh in the
        period). Road freight {data.notes.freightFactor * 1000} kg CO2e per tonne-kilometre.
        {data.notes.biogenicFuelKg > 0 && ` ${data.notes.biogenicFuelKg} kg of biomass start-up fuel is biogenic and not counted.`}
        {data.notes.legsWithoutDistance > 0 &&
          ` ${data.notes.legsWithoutDistance} road ${data.notes.legsWithoutDistance === 1 ? 'leg has' : 'legs have'} no distance yet and ${data.notes.legsWithoutDistance === 1 ? 'is' : 'are'} not counted.`}
      </p>
    </>
  )
}
