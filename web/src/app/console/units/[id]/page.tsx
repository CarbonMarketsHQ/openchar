import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle, KeyValues } from '@/design'
import { api } from '@/lib/api'
import { ApiDown, EmptyState, fmtDate, fmtKg } from '../../bits'
import { statusLabel } from '@/lib/labels'
import { ApplyUnit, DeliverUnit, MergeUnit, SplitUnit } from './actions'
import { UnitQr } from './qr'

type Unit = {
  id: string
  kind: string
  massKg: number
  status: string
  originBatch: string | null
  createdAt: string
  events: { kind: string; at: string; detail: Record<string, unknown> }[]
  parents: { id: string; originBatch: string | null }[]
  children: string[]
}

const TONE = { 'in-storage': 'info', delivered: 'caution', applied: 'positive', split: 'neutral', merged: 'neutral' } as const

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const unit = await api<Unit>(`/units/${encodeURIComponent(id)}`)
  if (unit === null) {
    const health = await api<{ ok: boolean }>('/health')
    if (!health) return <ApiDown />
    return <EmptyState title={`No unit called ${id}`} />
  }
  const siblings =
    unit.status === 'in-storage' && unit.originBatch
      ? ((await api<{ id: string; massKg: number; status: string }[]>(`/units?batch=${unit.originBatch}`)) ?? [])
          .filter((u) => u.id !== unit.id && u.status === 'in-storage')
      : []

  return (
    <>
      <div className="page-head">
        <h1>
          Unit <span className="mono">{unit.id}</span>
        </h1>
        <Badge tone={TONE[unit.status as keyof typeof TONE] ?? 'neutral'} data-testid="unit-status">
          {statusLabel(unit.status)}
        </Badge>
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        {unit.status === 'in-storage' && <SplitUnit unitId={unit.id} massKg={unit.massKg} />}
        {unit.status === 'in-storage' && <MergeUnit unitId={unit.id} candidates={siblings} />}
        {unit.status === 'in-storage' && <DeliverUnit unitId={unit.id} />}
        {(unit.status === 'in-storage' || unit.status === 'delivered') && <ApplyUnit unitId={unit.id} />}
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-5)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <Card>
          <CardHead>
            <CardTitle desc="Print this label onto the bag; scanning it lands on this page.">QR label</CardTitle>
          </CardHead>
          <CardBody>
            <UnitQr unitId={unit.id} />
            <KeyValues
              items={[
                { label: 'Kind', value: statusLabel(unit.kind) },
                { label: 'Mass', value: fmtKg(unit.massKg) },
                {
                  label: 'Origin batch',
                  value: unit.originBatch ? (
                    <Link href={`/console/batches/${unit.originBatch}`} className="mono" data-testid="unit-origin">
                      {unit.originBatch}
                    </Link>
                  ) : (
                    'Mixed origin'
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHead>
            <CardTitle desc="Parents, children and every custody event, oldest first.">Lineage</CardTitle>
          </CardHead>
          <CardBody>
            <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
              {unit.parents.length > 0 && (
                <div className="dp-row" data-testid="unit-parents">
                  <span className="muted">From</span>
                  {unit.parents.map((p) => (
                    <Link key={p.id} href={`/console/units/${p.id}`} className="mono">
                      {p.id}
                    </Link>
                  ))}
                </div>
              )}
              {unit.children.length > 0 && (
                <div className="dp-row" data-testid="unit-children">
                  <span className="muted">Into</span>
                  {unit.children.map((c) => (
                    <Link key={c} href={`/console/units/${c}`} className="mono">
                      {c}
                    </Link>
                  ))}
                </div>
              )}
              {unit.events.map((e, i) => (
                <div key={i} className="dp-row" data-testid="unit-event">
                  <span className="mono muted">{fmtDate(e.at)}</span>
                  <b>{statusLabel(e.kind)}</b>
                  <span className="muted">{JSON.stringify(e.detail)}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
