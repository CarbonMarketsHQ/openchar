import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle, Notice } from '@/design'
import { api, type BatchDetail, type BatchRow } from '@/lib/api'
import { DataFallback, fmtDate } from '../bits'
import { statusLabel } from '@/lib/labels'

export default async function Lab() {
  const batches = await api<BatchRow[]>('/batches')
  if (!batches) return <DataFallback />
  const details = (
    await Promise.all(batches.map((b) => api<BatchDetail>(`/batches/${b.id}`)))
  ).filter((b): b is BatchDetail => b !== null)

  const samples = details.flatMap((b) => b.samples.map((s) => ({ ...s, batchId: b.id })))
  const certified = details.filter((b) => b.certificate)

  return (
    <>
      <div className="page-head">
        <h1>Lab</h1>
        <p className="sub">
          Method A sampling: three independent samples per batch, submitted separately, thirty
          across the initial campaign. Certificates land here with every value traceable to the
          page it came from.
        </p>
      </div>

      <Card>
        <CardHead>
          <CardTitle desc="Chain of custody from silo discharge to the lab bench.">Samples</CardTitle>
        </CardHead>
        <CardBody>
          <div className="ui-tablewrap">
            <table className="ui-table">
              <caption className="u-sr">Samples and their lab state</caption>
              <thead>
                <tr>
                  <th scope="col">Sample</th>
                  <th scope="col">Batch</th>
                  <th scope="col">Taken</th>
                  <th scope="col">Where it was drawn</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((s) => (
                  <tr key={s.id} data-testid="sample-row">
                    <td className="mono">{s.id}</td>
                    <td className="mono">{s.batchId}</td>
                    <td>{fmtDate(s.takenAt)}</td>
                    <td>{s.note}</td>
                    <td>
                      <Badge tone={s.state === 'analyzed' ? 'positive' : 'caution'} variant={s.state === 'analyzed' ? 'soft' : 'dashed'}>
                        {statusLabel(s.state)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {certified.map((b) => {
        const c = b.certificate!
        const hPass = c.hCorg < 0.5
        const oPass = c.oCorg < 0.2
        return (
          <Card key={b.id}>
            <CardHead>
              <CardTitle
                desc={
                  <>
                    {c.lab} ·{' '}
                    <Link href={`/console/sources/${c.sourceId}`} data-testid="lab-cert-source">
                      certificate source
                    </Link>
                  </>
                }
              >
                Certificate · batch {b.id}
              </CardTitle>
            </CardHead>
            <CardBody>
              <div className="stat-grid">
                <div className="stat">
                  <span className="k" data-stamp>Organic carbon</span>
                  <span className="v" data-testid="lab-corg" data-value={c.corgFrac}>
                    {(c.corgFrac * 100).toFixed(0)}
                    <small> % of dry mass</small>
                  </span>
                </div>
                <div className="stat">
                  <span className="k" data-stamp>H/Corg</span>
                  <span className="v" data-testid="lab-hcorg" data-value={c.hCorg}>
                    {c.hCorg.toFixed(2)}
                  </span>
                  <span className="d gatechip">
                    <Badge tone={hPass ? 'positive' : 'negative'} data-testid="gate-hcorg" data-state={hPass ? 'pass' : 'fail'}>
                      {hPass ? 'Inside' : 'Outside'} the 0.5 gate
                    </Badge>
                  </span>
                </div>
                <div className="stat">
                  <span className="k" data-stamp>O/Corg</span>
                  <span className="v" data-testid="lab-ocorg" data-value={c.oCorg}>
                    {c.oCorg.toFixed(2)}
                  </span>
                  <span className="d gatechip">
                    <Badge tone={oPass ? 'positive' : 'negative'} data-testid="gate-ocorg" data-state={oPass ? 'pass' : 'fail'}>
                      {oPass ? 'Inside' : 'Outside'} the 0.2 gate
                    </Badge>
                  </span>
                </div>
                <div className="stat">
                  <span className="k" data-stamp>Moisture</span>
                  <span className="v" data-value={c.moistureFrac}>
                    {(c.moistureFrac * 100).toFixed(0)}
                    <small> %</small>
                  </span>
                  <span className="d">Dry-mass basis for the ledger</span>
                </div>
              </div>
            </CardBody>
          </Card>
        )
      })}

      <Notice tone="info" title="Coming next">
        Heavy metals and PAHs checked against the World Biochar Certificate limits, the same way
        H/Corg and O/Corg are checked today, and certificate PDFs read automatically.
      </Notice>
    </>
  )
}
