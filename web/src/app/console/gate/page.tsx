import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle, Notice } from '@/design'
import { api, type BatchRow, type Consignment, type Lot } from '@/lib/api'
import { DataFallback, fmtDate, fmtKg } from '../bits'
import { statusLabel } from '@/lib/labels'
import { AttachLot } from './attach-lot'
import { NewLot } from './new-lot'
import { NotDuplicate } from './duplicates'

export default async function Gate() {
  const [consignments, lots, batches, dupes] = await Promise.all([
    api<Consignment[]>('/consignments'),
    api<Lot[]>('/lots'),
    api<BatchRow[]>('/batches'),
    api<{ kind: string; ids: string[]; reason: string }[]>('/duplicates'),
  ])
  const gateDupes = (dupes ?? []).filter((d) => d.kind !== 'file')
  const flagged = new Set(gateDupes.flatMap((d) => d.ids))
  if (!consignments || !lots || !batches) return <DataFallback />
  const openCodes = batches.filter((b) => b.status === 'open').map((b) => b.id)
  const pending = consignments.filter((c) => c.state === 'received')


  return (
    <>
      <div className="page-head">
        <h1>Gate</h1>
        <NewLot pending={pending} />
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        Consignments arrive from the collection point with the field app's records. Receiving one
        into a lot pairs the hopper-scale mass with the weighbridge slip.
      </p>

      {gateDupes.length > 0 && (
        <div data-testid="duplicates">
          <Notice tone="caution" title={gateDupes.length === 1 ? 'A possible duplicate' : `${gateDupes.length} possible duplicates`}>
            <ul className="dupe-list">
              {gateDupes.map((d) => (
                <li key={`${d.kind}:${d.ids.join('|')}`} data-testid="duplicate-item">
                  <span>
                    <span className="mono">{d.ids.join(' and ')}</span>: {d.reason}.
                  </span>
                  <NotDuplicate kind={d.kind} ids={d.ids} />
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <Card>
        <CardHead>
          <CardTitle desc="Everything captured in the field, synced at the plant.">Consignments</CardTitle>
        </CardHead>
        <CardBody>
          <div className="ui-tablewrap">
            <table className="ui-table">
              <caption className="u-sr">Consignments from the aggregation centre</caption>
              <thead>
                <tr>
                  <th scope="col">Consignment</th>
                  <th scope="col">Supplier</th>
                  <th scope="col" data-numeric>Field estimate</th>
                  <th scope="col" data-numeric>Moisture</th>
                  <th scope="col">Captured</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {consignments.map((c) => (
                  <tr key={c.id} id={`consignment-${c.id}`} data-testid="consignment-row">
                    <td className="mono">
                      {c.id}
                      {flagged.has(c.id) && (
                        <>
                          {' '}
                          <Badge tone="caution" variant="dashed" data-testid="duplicate-badge">
                            Possible duplicate
                          </Badge>
                        </>
                      )}
                    </td>
                    <td>{c.supplierName}</td>
                    <td data-numeric>{fmtKg(c.estMassKg)}</td>
                    <td data-numeric>{c.moistureFrac === null ? '–' : `${(c.moistureFrac * 100).toFixed(0)}%`}</td>
                    <td>{fmtDate(c.capturedAt)}</td>
                    <td>
                      {c.state === 'received' ? (
                        <Badge tone="caution" variant="dashed">
                          Awaiting lot
                        </Badge>
                      ) : (
                        <Badge tone="positive">{c.lotId ?? 'attached'}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <section>
        <h2 className="section-title">Intake lots</h2>
        <div className="stat-grid">
          {[...lots].reverse().map((l) => {
            const delta = l.weighbridgeSlipKg === null ? null : l.hopperMassKg - l.weighbridgeSlipKg
            return (
              <div className="stat" data-testid="lot-card" key={l.id} id={`lot-${l.id}`}>
                <span className="k" data-stamp>{l.id}</span>
                <span className="v" data-testid="lot-hopper-mass">
                  {Math.round(l.hopperMassKg)}
                  <small> kg hopper</small>
                </span>
                <span className="d" data-testid="lot-weighbridge-slip-mass">
                  {l.weighbridgeSlipKg === null ? 'no slip yet' : `${Math.round(l.weighbridgeSlipKg)} kg weighbridge slip`}
                  {l.slipSourceId && (
                    <>
                      {' · '}
                      <Link href={`/console/sources/${l.slipSourceId}`}>slip</Link>
                    </>
                  )}
                </span>
                {delta !== null && (
                  <span className="d mono" data-testid="lot-mass-delta">
                    Δ {delta > 0 ? '+' : ''}
                    {Math.round(delta)} kg between scales
                  </span>
                )}
                {l.batchCode ? (
                  <span className="d mono">Feeding batch {l.batchCode}</span>
                ) : (
                  <AttachLot lotId={l.id} batchCodes={openCodes} />
                )}
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
