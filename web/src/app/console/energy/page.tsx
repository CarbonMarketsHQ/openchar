import Link from 'next/link'
import { Card, CardBody, CardHead, CardTitle } from '@/design'
import { api, type BatchRow } from '@/lib/api'
import { fmtCo2e, fuelLabel, fuelUseLabel } from '@/lib/labels'
import { DataFallback } from '../bits'
import { When } from '../when'
import { AddReading, LogFuel, UploadReadings } from './forms'

type FuelLog = {
  fuels: { value: string; unit: string; kgCo2ePerUnit: number; basis: string }[]
  entries: {
    id: string
    batch: string | null
    loggedAt: string
    fuel: string
    quantity: number
    unit: string
    use: string
    vehicle: string | null
    tripKm: number | null
    co2eT: number
  }[]
  totalCo2eT: number
}
type Meter = { meter: string; readings: number; lastAt: string; lastKwh: number; lastSource: string }

export default async function EnergyPage() {
  const [fuel, meters, batches] = await Promise.all([
    api<FuelLog>('/fuel'),
    api<Meter[]>('/meters'),
    api<BatchRow[]>('/batches'),
  ])
  if (!fuel || !meters || !batches) return <DataFallback />

  return (
    <>
      <div className="page-head">
        <h1>Energy</h1>
        <LogFuel batches={batches.map((b) => b.id)} />
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        Fuel burned at the plant and on vehicle trips, and the electricity meters. A batch&rsquo;s ledger takes these
        figures when you apply them from the batch page.
      </p>

      <Card>
        <CardHead>
          <CardTitle desc={`Newest first. ${fmtCo2e(fuel.totalCo2eT)} from fossil fuel in total.`}>Fuel log</CardTitle>
        </CardHead>
        <CardBody>
          {fuel.entries.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No fuel logged yet.
            </p>
          ) : (
            <div className="ui-tablewrap">
              <table className="ui-table shift-table">
                <caption className="u-sr">Fuel log</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Used for</th>
                    <th scope="col">Fuel</th>
                    <th scope="col" data-numeric>
                      Quantity
                    </th>
                    <th scope="col">Batch or vehicle</th>
                    <th scope="col" data-numeric>
                      CO2e
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fuel.entries.map((e) => (
                    <tr key={e.id} data-testid="fuel-row">
                      <td>
                        <When iso={e.loggedAt} />
                      </td>
                      <td>{fuelUseLabel(e.use)}</td>
                      <td>{fuelLabel(e.fuel)}</td>
                      <td data-numeric>
                        {e.quantity.toLocaleString('en-GB')} {e.unit}
                      </td>
                      <td>
                        {e.batch ? (
                          <Link href={`/console/batches/${e.batch}`} className="mono">
                            {e.batch}
                          </Link>
                        ) : (
                          <span>
                            {e.vehicle ?? '–'}
                            {e.tripKm !== null && <span className="muted">, {e.tripKm} km</span>}
                          </span>
                        )}
                      </td>
                      <td data-numeric>{e.co2eT === 0 ? <span className="muted">Biogenic</span> : fmtCo2e(e.co2eT)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead>
          <CardTitle desc="Running totals in kWh. A batch uses the rise across its window, read between the nearest readings.">
            Electricity meters
          </CardTitle>
        </CardHead>
        <CardBody>
          <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            {meters.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No readings yet. Add one by hand, upload a CSV, or post readings from the meter to the API.
              </p>
            ) : (
              <div className="ui-tablewrap">
                <table className="ui-table shift-table">
                  <caption className="u-sr">Electricity meters</caption>
                  <thead>
                    <tr>
                      <th scope="col">Meter</th>
                      <th scope="col" data-numeric>
                        Last total
                      </th>
                      <th scope="col">Last read</th>
                      <th scope="col" data-numeric>
                        Readings
                      </th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meters.map((m) => (
                      <tr key={m.meter} data-testid="meter-row">
                        <td>{m.meter}</td>
                        <td data-numeric>{m.lastKwh.toLocaleString('en-GB')} kWh</td>
                        <td>
                          <When iso={m.lastAt} />
                        </td>
                        <td data-numeric>{m.readings}</td>
                        <td>{m.lastSource === 'csv' ? 'CSV upload' : m.lastSource === 'api' ? 'Meter feed' : 'By hand'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <AddReading meters={meters.map((m) => m.meter)} />
              <UploadReadings />
              <span className="muted" style={{ fontSize: 'var(--t-ui-sm)' }}>
                CSV columns: <span className="mono">meter,read_at,kwh</span>
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      <p className="muted" style={{ margin: 0, fontSize: 'var(--t-caption)', maxWidth: 'var(--measure)' }}>
        Emission factors: IPCC 2006 defaults.{' '}
        {fuel.fuels
          .filter((f) => f.kgCo2ePerUnit > 0)
          .map((f) => `${fuelLabel(f.value)} ${f.kgCo2ePerUnit} kg CO2 per ${f.unit === 'l' ? 'litre' : 'kg'} (${f.basis})`)
          .join('. ')}
        . Biomass start-up fuel is biogenic and adds no fossil CO2.
      </p>
    </>
  )
}
