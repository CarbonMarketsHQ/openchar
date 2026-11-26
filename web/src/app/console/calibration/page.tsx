import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle } from '@/design'
import { api, type Facility } from '@/lib/api'
import { CALIBRATION_RESULTS, CALIBRATION_STATE, instrumentKindLabel, relativeDays } from '@/lib/labels'
import { DataFallback, Stat, fmtDate } from '../bits'
import type { Doc } from '../documents/document-list'
import { AddInstrument, RecordCalibration } from './forms'

export type Instrument = {
  id: string
  name: string
  kind: string
  serial: string | null
  intervalDays: number
  lastCalibratedAt: string | null
  lastResult: string | null
  dueOn: string | null
  daysToDue: number | null
  state: string
}
type Register = {
  dueSoonDays: number
  instruments: Instrument[]
  counts: { current: number; dueSoon: number; overdue: number; never: number; failed: number }
  history: {
    id: string
    instrumentName: string
    calibratedOn: string
    nextDue: string
    performedBy: string
    result: string
    sourceId: string | null
    note: string | null
  }[]
}

const ORDER: Record<string, number> = { overdue: 0, failed: 1, never: 2, 'due-soon': 3, current: 4 }

export default async function CalibrationPage() {
  const [reg, facilities, certs] = await Promise.all([
    api<Register>('/instruments'),
    api<Facility[]>('/facilities'),
    api<{ documents: Doc[] }>('/documents?type=calibration'),
  ])
  if (!reg || !facilities || !certs) return <DataFallback />
  const certificates = certs.documents.map((d) => ({ id: d.id, title: d.title }))
  const titles = new Map(certificates.map((c) => [c.id, c.title]))
  const sorted = [...reg.instruments].sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.daysToDue ?? 0) - (b.daysToDue ?? 0))
  const lapsed = reg.counts.overdue + reg.counts.failed

  return (
    <>
      <div className="page-head">
        <h1>Calibration</h1>
        <AddInstrument facilities={facilities.map((f) => ({ id: f.id, name: f.name }))} />
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        Every instrument whose reading ends up in a record, when it was last calibrated and when it falls due.
        Instruments due within {reg.dueSoonDays} days are flagged ahead of time.
      </p>

      <div className="stat-grid" data-testid="calibration-counts">
        <Stat label="In calibration" value={String(reg.counts.current)} detail="Next due in more than 30 days" />
        <Stat label="Due soon" value={String(reg.counts.dueSoon)} detail={`Within ${reg.dueSoonDays} days`} />
        <Stat label="Lapsed" value={String(lapsed)} detail={lapsed ? 'Readings since then need a note' : 'None'} />
        <Stat label="Never calibrated" value={String(reg.counts.never)} detail="Added with no calibration yet" />
      </div>

      <Card>
        <CardHead>
          <CardTitle desc="Lapsed and due instruments first.">Instruments</CardTitle>
        </CardHead>
        <CardBody>
          {sorted.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No instruments yet. Add the scales and sensors whose readings feed the records.
            </p>
          ) : (
            <div className="ui-tablewrap">
              <table className="ui-table shift-table">
                <caption className="u-sr">Instruments and their calibration status</caption>
                <thead>
                  <tr>
                    <th scope="col">Instrument</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Last calibrated</th>
                    <th scope="col">Next due</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="u-sr">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((i) => {
                    const st = CALIBRATION_STATE[i.state] ?? CALIBRATION_STATE.never
                    return (
                      <tr key={i.id} data-testid="instrument-row" data-state={i.state}>
                        <td>
                          <div>{i.name}</div>
                          {i.serial && (
                            <div className="mono muted" style={{ fontSize: 'var(--t-caption)' }}>
                              {i.serial}
                            </div>
                          )}
                        </td>
                        <td>{instrumentKindLabel(i.kind)}</td>
                        <td>{i.lastCalibratedAt ? fmtDate(i.lastCalibratedAt) : <span className="muted">Never</span>}</td>
                        <td>
                          {i.dueOn ? (
                            <>
                              <div>{fmtDate(i.dueOn)}</div>
                              <div className="muted" style={{ fontSize: 'var(--t-caption)' }} data-testid="instrument-due">
                                {relativeDays(i.daysToDue ?? 0)}
                              </div>
                            </>
                          ) : (
                            <span className="muted">–</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={st.tone} variant={i.state === 'never' ? 'dashed' : undefined} data-testid="instrument-state">
                            {st.label}
                          </Badge>
                        </td>
                        <td>
                          <RecordCalibration id={i.id} name={i.name} intervalDays={i.intervalDays} certificates={certificates} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {reg.history.length > 0 && (
        <Card>
          <CardHead>
            <CardTitle desc="Every calibration on record, newest first.">History</CardTitle>
          </CardHead>
          <CardBody>
            <div className="ui-tablewrap">
              <table className="ui-table shift-table">
                <caption className="u-sr">Calibration history</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Instrument</th>
                    <th scope="col">Result</th>
                    <th scope="col">Calibrated by</th>
                    <th scope="col">Certificate</th>
                  </tr>
                </thead>
                <tbody>
                  {reg.history.map((c) => (
                    <tr key={c.id} data-testid="calibration-row">
                      <td>{fmtDate(c.calibratedOn)}</td>
                      <td>{c.instrumentName}</td>
                      <td>{CALIBRATION_RESULTS.find((r) => r.value === c.result)?.label ?? c.result}</td>
                      <td className="shift-handover-cell">{c.performedBy}</td>
                      <td className="shift-handover-cell">
                        {c.sourceId ? (
                          <Link href={`/console/sources/${c.sourceId}`}>{titles.get(c.sourceId) ?? 'Certificate'}</Link>
                        ) : (
                          <span className="muted">–</span>
                        )}
                      </td>
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
