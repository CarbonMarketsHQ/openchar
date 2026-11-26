import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle } from '@/design'
import { api } from '@/lib/api'
import { causeLabel, fmtDuration } from '@/lib/labels'
import { DataFallback } from '../bits'
import { When } from '../when'
import { EndDowntime, EndShift, LogDowntime, StartShift } from './forms'

type Shift = {
  id: string
  operator: string
  startedAt: string
  endedAt: string | null
  durationMin: number
  notes: string | null
  handover: string | null
  batches: string[]
  downtimeMin: number
}
type Downtime = {
  id: string
  cause: string
  startedAt: string
  endedAt: string | null
  durationMin: number
  note: string | null
}
type DowntimeMonth = {
  month: string
  entries: Downtime[]
  summary: { cause: string; minutes: number; count: number }[]
  totalMin: number
  ongoing: Downtime[]
}

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function BatchLinks({ codes }: { codes: string[] }) {
  if (codes.length === 0) return <span className="muted">None</span>
  return (
    <span className="doc-links">
      {codes.map((c) => (
        <Link key={c} href={`/console/batches/${c}`} className="mono">
          {c}
        </Link>
      ))}
    </span>
  )
}

export default async function ShiftsPage() {
  const [log, down] = await Promise.all([
    api<{ open: Shift[]; shifts: Shift[]; lastHandover: Shift | null }>('/shifts'),
    api<DowntimeMonth>('/downtime'),
  ])
  if (!log || !down) return <DataFallback />
  const open = log.open[0] ?? null
  const longest = Math.max(1, ...down.summary.map((s) => s.minutes))

  return (
    <>
      <div className="page-head">
        <h1>Shift log</h1>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <LogDowntime />
          {!open && <StartShift />}
        </div>
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        Who ran the reactor, what happened, and what the next shift needs to know. Batches run during a
        shift are matched by time.
      </p>

      <div className="shift-now">
        <Card data-testid="shift-open">
          <CardHead>
            <CardTitle desc={open ? undefined : 'Start a shift when the next operator takes over.'}>
              {open ? 'On shift now' : 'No one on shift'}
            </CardTitle>
          </CardHead>
          <CardBody>
            {open ? (
              <div className="shift-current">
                <div className="shift-who">
                  <b data-testid="shift-operator-now">{open.operator}</b>
                  <span className="muted">
                    since <When iso={open.startedAt} />, {fmtDuration(open.durationMin)}
                  </span>
                </div>
                <div className="shift-facts">
                  <span className="muted">Batches</span>
                  <BatchLinks codes={open.batches} />
                  <span className="muted">Downtime</span>
                  <span>{open.downtimeMin ? fmtDuration(open.downtimeMin) : 'None'}</span>
                </div>
                {open.notes && <p style={{ margin: 0 }}>{open.notes}</p>}
                <div>
                  <EndShift id={open.id} operator={open.operator} notes={open.notes} />
                </div>
              </div>
            ) : (
              <StartShift variant="outline" />
            )}
          </CardBody>
        </Card>

        <Card data-testid="shift-handover-card">
          <CardHead>
            <CardTitle
              desc={
                log.lastHandover ? (
                  <>
                    From {log.lastHandover.operator}, <When iso={log.lastHandover.endedAt!} />
                  </>
                ) : (
                  'Written when a shift ends'
                )
              }
            >
              Last handover
            </CardTitle>
          </CardHead>
          <CardBody>
            {log.lastHandover ? (
              <blockquote className="handover" data-testid="last-handover">
                {log.lastHandover.handover}
              </blockquote>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No handover yet.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card data-testid="downtime-month">
        <CardHead>
          <CardTitle desc={`${monthName(down.month)}, by cause. Stops that cross the month boundary count only their minutes in it.`}>
            Downtime this month
          </CardTitle>
        </CardHead>
        <CardBody>
          {down.entries.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No downtime logged this month.
            </p>
          ) : (
            <div className="downtime">
              <p className="downtime-total" data-testid="downtime-total">
                <b>{fmtDuration(down.totalMin)}</b>
                <span className="muted">
                  {' '}
                  across {down.entries.length} {down.entries.length === 1 ? 'stop' : 'stops'}
                </span>
              </p>
              <ul className="cause-bars" aria-label="Downtime by cause">
                {down.summary.map((s) => (
                  <li key={s.cause} data-testid="cause-row">
                    <span className="cause-name">{causeLabel(s.cause)}</span>
                    <span className="cause-track" aria-hidden="true">
                      <span className="cause-fill" style={{ width: `${(s.minutes / longest) * 100}%` }} />
                    </span>
                    <span className="cause-min num">{fmtDuration(s.minutes)}</span>
                  </li>
                ))}
              </ul>
              {down.ongoing.map((d) => (
                <div key={d.id} className="dp-row" data-testid="downtime-ongoing">
                  <Badge tone="negative">Down now</Badge>
                  <span>
                    {causeLabel(d.cause)} since <When iso={d.startedAt} />
                  </span>
                  <EndDowntime id={d.id} />
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead>
          <CardTitle desc="Newest first, with the batches each shift ran.">Shifts</CardTitle>
        </CardHead>
        <CardBody>
          {log.shifts.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No shifts logged yet.
            </p>
          ) : (
            <div className="ui-tablewrap">
              <table className="ui-table shift-table">
                <caption className="u-sr">Shifts</caption>
                <thead>
                  <tr>
                    <th scope="col">Operator</th>
                    <th scope="col">Started</th>
                    <th scope="col">Ended</th>
                    <th scope="col" data-numeric>
                      Length
                    </th>
                    <th scope="col">Batches</th>
                    <th scope="col" data-numeric>
                      Downtime
                    </th>
                    <th scope="col">Handover</th>
                  </tr>
                </thead>
                <tbody>
                  {log.shifts.map((s) => (
                    <tr key={s.id} data-testid="shift-row">
                      <td>{s.operator}</td>
                      <td>
                        <When iso={s.startedAt} />
                      </td>
                      <td>{s.endedAt ? <When iso={s.endedAt} /> : <Badge tone="info">On shift</Badge>}</td>
                      <td data-numeric>{fmtDuration(s.durationMin)}</td>
                      <td>
                        <BatchLinks codes={s.batches} />
                      </td>
                      <td data-numeric>{s.downtimeMin ? fmtDuration(s.downtimeMin) : '–'}</td>
                      <td className="shift-handover-cell">{s.handover ?? <span className="muted">–</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {down.entries.length > 0 && (
        <Card>
          <CardHead>
            <CardTitle desc="Every stop this month, newest first.">Downtime log</CardTitle>
          </CardHead>
          <CardBody>
            <div className="ui-tablewrap">
              <table className="ui-table shift-table">
                <caption className="u-sr">Downtime entries</caption>
                <thead>
                  <tr>
                    <th scope="col">Cause</th>
                    <th scope="col">Started</th>
                    <th scope="col">Ended</th>
                    <th scope="col" data-numeric>
                      Duration
                    </th>
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {down.entries.map((d) => (
                    <tr key={d.id} data-testid="downtime-row">
                      <td>{causeLabel(d.cause)}</td>
                      <td>
                        <When iso={d.startedAt} />
                      </td>
                      <td>{d.endedAt ? <When iso={d.endedAt} /> : <Badge tone="negative">Down now</Badge>}</td>
                      <td data-numeric>{fmtDuration(d.durationMin)}</td>
                      <td className="shift-handover-cell">{d.note ?? <span className="muted">–</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </>
  )
}
