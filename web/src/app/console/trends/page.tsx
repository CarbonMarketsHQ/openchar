import { Card, CardBody, CardHead, CardTitle } from '@/design'
import { api } from '@/lib/api'
import { DataFallback, fmtKg } from '../bits'
import { MiniBars } from './mini-bars'

type Trend = {
  code: string
  status: string
  dryYieldPct: number | null
  throughputKgPerDay: number | null
  throughputKgPerShift: number | null
  shifts: number
  residenceMin: number | null
  kwhPerDryTonne: number | null
  fuelKgCo2ePerDryTonne: number | null
}
type Trends = { batches: Trend[]; months: { month: string; feedstockKg: number; biocharDryKg: number; batches: number }[] }

const METRICS: { key: keyof Trend; title: string; unit: string; digits?: number; desc: string }[] = [
  { key: 'dryYieldPct', title: 'Dry biochar yield', unit: '%', digits: 1, desc: 'Dry biochar as a share of dry feedstock' },
  { key: 'throughputKgPerDay', title: 'Throughput per day', unit: 'kg/day', desc: 'Feedstock over the days the batch was open' },
  { key: 'throughputKgPerShift', title: 'Throughput per shift', unit: 'kg/shift', desc: 'Feedstock over the shifts logged during the batch' },
  { key: 'residenceMin', title: 'Residence time', unit: 'min', desc: 'Time at temperature, from the run record' },
  { key: 'kwhPerDryTonne', title: 'Electricity per dry tonne', unit: 'kWh/t', desc: 'Metered kWh across the batch window' },
  { key: 'fuelKgCo2ePerDryTonne', title: 'Fuel per dry tonne', unit: 'kg CO2e/t', digits: 1, desc: 'Fossil fuel logged against the batch' },
]

export default async function TrendsPage() {
  const data = await api<Trends>('/trends')
  if (!data) return <DataFallback />
  return (
    <>
      <div className="page-head">
        <h1>Trends</h1>
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        How each batch ran, oldest first. A batch without the record a figure needs shows a gap rather than an estimate.
      </p>

      <div className="trend-grid">
        {METRICS.map((m) => (
          <Card key={m.key} data-testid={`trend-${m.key}`}>
            <CardHead>
              <CardTitle desc={m.desc}>
                {m.title} <span className="muted trend-unit">{m.unit}</span>
              </CardTitle>
            </CardHead>
            <CardBody>
              <MiniBars
                unit={m.unit}
                digits={m.digits}
                items={data.batches.map((b) => ({ label: b.code, value: b[m.key] as number | null }))}
              />
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHead>
          <CardTitle desc="Closed batches, by the month they closed.">Production by month</CardTitle>
        </CardHead>
        <CardBody>
          {data.months.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No batch has closed yet.
            </p>
          ) : (
            <div className="ui-tablewrap">
              <table className="ui-table shift-table">
                <caption className="u-sr">Production by month</caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col" data-numeric>
                      Batches
                    </th>
                    <th scope="col" data-numeric>
                      Feedstock
                    </th>
                    <th scope="col" data-numeric>
                      Dry biochar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month} data-testid="trend-month">
                      <td>{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</td>
                      <td data-numeric>{m.batches}</td>
                      <td data-numeric>{fmtKg(m.feedstockKg)}</td>
                      <td data-numeric>{fmtKg(m.biocharDryKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  )
}
