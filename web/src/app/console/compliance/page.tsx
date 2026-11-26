import { Badge, Card, CardBody, CardHead, CardTitle } from '@/design'
import { api, type Compliance } from '@/lib/api'
import { DataFallback } from '../bits'
import { statusLabel } from '@/lib/labels'

const TONE = { pass: 'positive', warn: 'caution', fail: 'negative' } as const

function Rows({ rows }: { rows: Compliance['requirements'] }) {
  return (
    <div className="ui-tablewrap">
      <table className="ui-table">
        <caption className="u-sr">Requirement states computed from live project data</caption>
        <thead>
          <tr>
            <th scope="col">Requirement</th>
            <th scope="col">State</th>
            <th scope="col">Where it stands</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-req={r.id} data-state={r.state}>
              <td>
                <span className="mono" style={{ display: 'block' }}>
                  {r.id}
                </span>
                <span className="muted" style={{ fontSize: 'var(--t-caption)' }}>
                  {r.title}
                </span>
              </td>
              <td>
                <Badge tone={TONE[r.state]}>{statusLabel(r.state)}</Badge>
              </td>
              <td style={{ maxWidth: '38ch' }}>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function CompliancePage() {
  const compliance = await api<Compliance>('/compliance')
  if (!compliance) return <DataFallback />
  return (
    <>
      <div className="page-head">
        <h1>Compliance</h1>
        <p className="sub">
          The Isometric requirements table, evaluated live against this project's data. Nothing
          here is hand-set; fix the data and the state follows.
        </p>
      </div>
      <div data-testid="compliance-table" style={{ display: 'grid', gap: 'var(--sp-6)' }}>
        <Card>
          <CardHead>
            <CardTitle desc="Biochar Production and Storage v1.3, requirement IDs as Isometric publishes them.">
              Protocol requirements
            </CardTitle>
          </CardHead>
          <CardBody>
            <Rows rows={compliance.requirements} />
          </CardBody>
        </Card>
        <Card>
          <CardHead>
            <CardTitle desc="What the discovery call surfaced, tracked to closure.">Site readiness</CardTitle>
          </CardHead>
          <CardBody>
            <Rows rows={compliance.site} />
          </CardBody>
        </Card>
      </div>
    </>
  )
}
