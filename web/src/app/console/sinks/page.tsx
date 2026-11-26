import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle } from '@/design'
import { api } from '@/lib/api'
import { sinkLabel } from '@/lib/labels'
import { DataFallback, fmtDate, fmtKg } from '../bits'
import { ChangeSink } from './change-sink'

type Sinks = {
  summary: { sink: string; massKg: number; count: number; credited: boolean; note: string }[]
  applications: { id: string; sink: string; site: string; massKg: number; areaHa: number | null; appliedAt: string; batch: string | null }[]
}

export default async function SinksPage() {
  const data = await api<Sinks>('/sinks')
  if (!data) return <DataFallback />
  return (
    <>
      <div className="page-head">
        <h1>Carbon sinks</h1>
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        Where every applied kilogram of biochar ended up. This ledger version credits storage in soil. Other sinks are recorded
        with the same evidence and are not credited until their accounting is added.
      </p>

      <div className="stat-grid" data-testid="sink-summary">
        {data.summary.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No applications recorded yet.
          </p>
        ) : (
          data.summary.map((s) => (
            <div className="stat" key={s.sink} data-testid="sink-type" data-sink={s.sink}>
              <span className="k" data-stamp>
                {sinkLabel(s.sink)}
              </span>
              <span className="v">
                {Math.round(s.massKg).toLocaleString('en-GB')}
                <small> kg</small>
              </span>
              <span className="d">
                <Badge tone={s.credited ? 'positive' : 'caution'} variant={s.credited ? undefined : 'dashed'}>
                  {s.credited ? 'Credited' : 'Not credited'}
                </Badge>{' '}
                {s.count} {s.count === 1 ? 'application' : 'applications'}
              </span>
            </div>
          ))
        )}
      </div>

      {data.summary.some((s) => !s.credited) && (
        <ul className="balance-checks" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
          {data.summary
            .filter((s) => !s.credited)
            .map((s) => (
              <li key={s.sink}>
                <Badge tone="caution">{sinkLabel(s.sink)}</Badge>
                <span>{s.note}</span>
              </li>
            ))}
        </ul>
      )}

      <Card>
        <CardHead>
          <CardTitle desc="Every application, newest first.">Register</CardTitle>
        </CardHead>
        <CardBody>
          <div className="ui-tablewrap">
            <table className="ui-table shift-table">
              <caption className="u-sr">Applications by sink</caption>
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Sink</th>
                  <th scope="col" data-numeric>
                    Mass
                  </th>
                  <th scope="col" data-numeric>
                    Area
                  </th>
                  <th scope="col">Batch</th>
                  <th scope="col">Applied</th>
                  <th scope="col">
                    <span className="u-sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.applications.map((a) => (
                  <tr key={a.id} data-testid="sink-row">
                    <td>{a.site}</td>
                    <td>{sinkLabel(a.sink)}</td>
                    <td data-numeric>{fmtKg(a.massKg)}</td>
                    <td data-numeric>{a.areaHa === null ? '–' : `${a.areaHa.toLocaleString('en-GB', { maximumFractionDigits: 2 })} ha`}</td>
                    <td>
                      {a.batch ? (
                        <Link href={`/console/batches/${a.batch}`} className="mono">
                          {a.batch}
                        </Link>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td>{fmtDate(a.appliedAt)}</td>
                    <td>
                      <ChangeSink id={a.id} sink={a.sink} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  )
}
