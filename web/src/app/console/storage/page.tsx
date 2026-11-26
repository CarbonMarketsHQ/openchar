import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle } from '@/design'
import { api } from '@/lib/api'
import { statusLabel } from '@/lib/labels'
import { DataFallback, fmtDate, fmtKg } from '../bits'
import { AddLocation, CountStock, MoveHere } from './forms'

type U = { id: string; kind: string; material: string; massKg: number; batch: string | null }
type Storage = {
  locations: { id: string; name: string; kind: string; units: U[]; massKg: number; lastCount: { at: string; missing: string[]; extra: string[] } | null }[]
  unplaced: U[]
}

function Chips({ units }: { units: U[] }) {
  if (units.length === 0) return <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }}>Empty.</p>
  return (
    <div className="doc-links">
      {units.map((u) => (
        <Link key={u.id} href={`/console/units/${u.id}`} className="mono" style={{ fontSize: 'var(--t-ui-sm)' }} data-testid="stock-unit">
          {u.id}
        </Link>
      ))}
    </div>
  )
}

export default async function StoragePage() {
  const data = await api<Storage>('/storage')
  if (!data) return <DataFallback />
  const everywhere = [
    ...data.locations.flatMap((l) => l.units.map((u) => ({ ...u, where: l.name, at: l.id }))),
    ...data.unplaced.map((u) => ({ ...u, where: 'no location', at: null as string | null })),
  ]
  return (
    <>
      <div className="page-head">
        <h1>Storage</h1>
        <AddLocation />
      </div>
      <p className="sub muted" style={{ margin: 0, maxWidth: 'var(--measure)' }}>
        Where every unit in stock is kept. Moves and returns go into each unit&rsquo;s custody chain, and a stock count
        shows what is missing or out of place.
      </p>
      <div className="trend-grid">
        {data.locations.map((l) => (
          <Card key={l.id} data-testid="location-card" data-location={l.name}>
            <CardHead>
              <CardTitle desc={`${statusLabel(l.kind)}, ${l.units.length} ${l.units.length === 1 ? 'unit' : 'units'}, ${fmtKg(l.massKg)}`}>{l.name}</CardTitle>
            </CardHead>
            <CardBody>
              <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                <Chips units={l.units} />
                {l.lastCount && (
                  <p className="muted" style={{ margin: 0, fontSize: 'var(--t-ui-sm)' }} data-testid="last-count">
                    <Badge tone={l.lastCount.missing.length || l.lastCount.extra.length ? 'caution' : 'positive'}>
                      {l.lastCount.missing.length || l.lastCount.extra.length ? 'Count did not match' : 'Count matched'}
                    </Badge>{' '}
                    {fmtDate(l.lastCount.at)}
                    {l.lastCount.missing.length > 0 && `. Missing ${l.lastCount.missing.join(', ')}`}
                    {l.lastCount.extra.length > 0 && `. Not expected ${l.lastCount.extra.join(', ')}`}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                  <MoveHere to={l.id} name={l.name} candidates={everywhere.filter((u) => u.at !== l.id)} />
                  <CountStock id={l.id} name={l.name} />
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
      {data.unplaced.length > 0 && (
        <Card data-testid="unplaced">
          <CardHead>
            <CardTitle desc="Units in storage with no location yet. Move them to where they are kept.">No location</CardTitle>
          </CardHead>
          <CardBody>
            <Chips units={data.unplaced} />
          </CardBody>
        </Card>
      )}
    </>
  )
}
