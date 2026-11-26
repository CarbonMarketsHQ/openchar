import Link from 'next/link'
import { Badge, Card, CardBody, CardHead, CardTitle, KeyValues, LinkButton, Notice } from '@/design'
import { api, type BatchDetail } from '@/lib/api'

type UnitRow = { id: string; massKg: number; status: string }
import { ApiDown, EmptyState, Stat, fmtDate, fmtKg } from '../../bits'
import { statusLabel } from '@/lib/labels'
import { CreateUnits } from './units-card'
import {
  AddCoProduct,
  CloseBatch,
  EditOps,
  EnterCertificate,
  NewDispatch,
  RecordApplication,
  RegisterSamples,
  UploadTelemetry,
} from './actions'
import { TempChart } from './temp-chart'
import { AddDocument } from '../../documents/add-document'
import { DocumentList, type Doc } from '../../documents/document-list'
import { Km } from '../../distance'
import { ApplyDelivery, RecordConsignmentKm, SetDelivery } from './transport'
import type { Distance } from '@/lib/api'

type Leg = { id: string; massKg: number } & Distance
type Transport = {
  roadFactor: number
  plantHasCoordinates: boolean
  collection: { items: (Leg & { supplier: string })[]; meanKm: number | null; tonneKm: number; missing: string[] }
  delivery: { items: (Leg & { toName: string })[]; meanKm: number | null; tonneKm: number; massT: number; missing: string[] }
  ledger: { transportKm: number; transportMassT: number } | null
}

const STATUS_TONE = { open: 'info', sampled: 'positive', 'awaiting-lab': 'caution', closed: 'neutral' } as const

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [batch, units, docs, shiftLog, transport] = await Promise.all([
    api<BatchDetail>(`/batches/${encodeURIComponent(id)}`),
    api<UnitRow[]>(`/units?batch=${encodeURIComponent(id)}`),
    api<{ documents: Doc[] }>(`/documents?record=${encodeURIComponent(`batch:${id}`)}`),
    api<{ shifts: { operator: string; batches: string[] }[] }>('/shifts?limit=200'),
    api<Transport>(`/batches/${encodeURIComponent(id)}/transport`),
  ])
  const operators = [
    ...new Set((shiftLog?.shifts ?? []).filter((s) => s.batches.includes(id)).map((s) => s.operator)),
  ]
  if (batch === null) {
    const health = await api<{ ok: boolean }>('/health')
    if (!health) return <ApiDown />
    return (
      <EmptyState title={`No batch called ${id}`}>
        It may not have synced yet. The batch list has everything the plant has recorded.{' '}
        <Link href="/console/batches">Back to batches</Link>
      </EmptyState>
    )
  }

  const yieldPct =
    batch.feedstockMassKg && batch.biocharWetKg
      ? ((batch.biocharWetKg / batch.feedstockMassKg) * 100).toFixed(1)
      : null
  const isOpen = batch.status === 'open'
  const needsCert = batch.status === 'awaiting-lab' || batch.status === 'closed'

  return (
    <>
      <div className="page-head">
        <h1>
          Batch <span className="mono">{batch.id}</span>
        </h1>
        <Badge tone={STATUS_TONE[batch.status as keyof typeof STATUS_TONE] ?? 'neutral'} data-testid="batch-status">
          {statusLabel(batch.status)}
        </Badge>
      </div>
      <p className="sub muted" style={{ margin: 0 }}>{batch.notes}</p>

      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }} data-testid="batch-actions">
        {isOpen && <CloseBatch code={batch.id} />}
        <UploadTelemetry code={batch.id} />
        {batch.samples.length === 0 && <RegisterSamples code={batch.id} />}
        {needsCert && batch.samples.length > 0 && <EnterCertificate code={batch.id} />}
        <EditOps code={batch.id} existing={batch.ops} />
        <AddCoProduct code={batch.id} />
        {!isOpen && <NewDispatch code={batch.id} />}
        {!isOpen && <CreateUnits code={batch.id} />}
      </div>

      <div className="stat-grid">
        <Stat
          label="Feedstock in"
          value={batch.feedstockMassKg === null ? 'Not recorded' : Math.round(batch.feedstockMassKg).toLocaleString('en-GB')}
          unit={batch.feedstockMassKg === null ? undefined : 'kg'}
          detail="Hopper scale, lot-linked"
        />
        <Stat
          label="Biochar out"
          value={batch.biocharWetKg === null ? 'Not recorded' : Math.round(batch.biocharWetKg).toLocaleString('en-GB')}
          unit={batch.biocharWetKg === null ? undefined : 'kg'}
          detail="Silo scale, wet basis"
        />
        <Stat label="Yield" value={yieldPct ? `${yieldPct}%` : '–'} detail="Wet biochar over feedstock" />
        <Stat
          label="Batch window"
          value={`${batch.ageDays}`}
          unit="days"
          detail={<>At most one month <span className="req-id">(R-6YSW-0)</span></>}
          testId="batch-age"
        />
      </div>

      <Card>
        <CardHead>
          <CardTitle desc="One-minute readings from the reactor. Anything below 400°C during the hold is flagged.">
            Reactor temperature
          </CardTitle>
        </CardHead>
        <CardBody>
          {batch.telemetry.points.length > 0 ? (
            <>
              <TempChart points={batch.telemetry.points} anomalies={batch.anomalies} />
              <p className="export-links">
                Download the one-minute series in the registry's format:{' '}
                <a href={`/api/oc/batches/${encodeURIComponent(batch.id)}/sensor-export?format=parquet`} data-testid="sensor-parquet">
                  Parquet
                </a>{' '}
                ·{' '}
                <a href={`/api/oc/batches/${encodeURIComponent(batch.id)}/sensor-export`} data-testid="sensor-json">
                  JSON
                </a>
              </p>
            </>
          ) : (
            <EmptyState title="No telemetry uploaded yet">
              Export the run from the PLC as minute,temperature rows and upload the CSV above.
            </EmptyState>
          )}
          {batch.anomalies.length > 0 && (
            <div style={{ marginTop: 'var(--sp-4)' }}>
              {batch.anomalies.map((a) => (
                <Notice key={a.fromMinute} tone="caution" title="Flagged automatically (R-8W08-0)">
                  <span data-testid="anomaly-list-item">
                    Temperature drop: {a.kind}, minutes {a.fromMinute} to {a.toMinute}, floor{' '}
                    {a.minTempC.toFixed(0)}°C. Keep the batch and note the cause in the run log. Consistency
                    is what unlocks Method B sampling.
                  </span>
                </Notice>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <div style={{ display: 'grid', gap: 'var(--sp-5)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card>
          <CardHead>
            <CardTitle desc="Three independent samples per batch, never composited.">Samples</CardTitle>
          </CardHead>
          <CardBody>
            {batch.samples.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                None registered yet.
              </p>
            ) : (
              <KeyValues
                items={batch.samples.map((s) => ({
                  label: <span className="mono">{s.label}</span>,
                  value: `${statusLabel(s.state)} · ${s.note}`,
                }))}
              />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHead>
            <CardTitle desc="Declared with their fate. Mass sent to the activation line earns no credits.">Co-products</CardTitle>
          </CardHead>
          <CardBody>
            {batch.coProducts.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                None declared yet (R-3MBJ-0 wants every stream on record).
              </p>
            ) : (
              <KeyValues
                items={batch.coProducts.map((c) => ({
                  label: `${statusLabel(c.kind)} ${c.grade}`,
                  value: `${fmtKg(c.massKg)} · ${c.fate}`,
                }))}
              />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHead>
            <CardTitle desc="QR-labelled packages with their own custody chains.">Units</CardTitle>
          </CardHead>
          <CardBody>
            {!units || units.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                None yet. Package the batch to track bags and silo lots individually.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                {units.map((u) => (
                  <div key={u.id} className="dp-row" data-testid="unit-row">
                    <Link href={`/console/units/${u.id}`} className="mono">
                      {u.id}
                    </Link>
                    <span className="num">{Math.round(u.massKg)} kg</span>
                    <span className="muted">{statusLabel(u.status)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
        <Card data-testid="batch-documents">
          <CardHead>
            <CardTitle desc="Certificates, slips, invoices and the rest attached to this batch.">Documents</CardTitle>
          </CardHead>
          <CardBody>
            {docs && docs.documents.length > 0 ? (
              <DocumentList docs={docs.documents} />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Nothing attached yet.
              </p>
            )}
            <div style={{ marginTop: 'var(--sp-4)', display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <AddDocument fixed={{ kind: 'batch', id: batch.id }} defaultType="lab-certificate" variant="outline" />
              <Link href={`/console/documents?record=${encodeURIComponent(`batch:${batch.id}`)}`} style={{ fontSize: 'var(--t-ui-sm)' }}>
                All documents
              </Link>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHead>
            <CardTitle desc="Out of the silo and into the ground, with evidence at each step.">Dispatches</CardTitle>
          </CardHead>
          <CardBody>
            {batch.dispatches.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nothing dispatched yet.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                {batch.dispatches.map((d) => (
                  <div key={d.id} style={{ display: 'grid', gap: 'var(--sp-2)' }} data-testid="dispatch-row">
                    <div className="dp-row">
                      <b>{d.toName}</b>
                      <span className="num">{fmtKg(d.massKg)}</span>
                      <span className="muted">{fmtDate(d.dispatchedAt)}</span>
                    </div>
                    {d.applications.length > 0 ? (
                      d.applications.map((a) => (
                        <div key={a.id} className="dp-row" data-testid="application-row">
                          <Badge tone="positive">Applied</Badge>
                          <span>{a.farmName}</span>
                          <span className="num">{fmtKg(a.appliedMassKg)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="dp-row">
                        <Badge tone="caution" variant="dashed">
                          Awaiting application evidence
                        </Badge>
                        <RecordApplication dispatchId={d.id} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {transport && (
        <Card data-testid="batch-transport">
          <CardHead>
            <CardTitle
              desc={`Collection and delivery kept apart. An estimate is the straight-line distance times ${transport.roadFactor} for roads, until a recorded distance replaces it.`}
            >
              Transport
            </CardTitle>
          </CardHead>
          <CardBody>
            <div className="transport">
              <section>
                <h3 className="transport-head">Feedstock collection</h3>
                <p className="muted transport-sum" data-testid="collection-summary">
                  {transport.collection.items.length === 0
                    ? 'No consignments in this batch yet.'
                    : `${transport.collection.items.length} ${transport.collection.items.length === 1 ? 'consignment' : 'consignments'}, mass-weighted ${transport.collection.meanKm ?? '–'} km, ${transport.collection.tonneKm} t·km`}
                </p>
                {transport.collection.items.map((c) => (
                  <div key={c.id} className="dp-row transport-row" data-testid="collection-row">
                    <span className="mono">{c.id}</span>
                    <span>{c.supplier}</span>
                    <span className="num">{fmtKg(c.massKg)}</span>
                    <Km d={c} />
                    <RecordConsignmentKm id={c.id} />
                  </div>
                ))}
              </section>
              <section>
                <h3 className="transport-head">Biochar delivery</h3>
                <p className="muted transport-sum" data-testid="delivery-summary">
                  {transport.delivery.items.length === 0
                    ? 'Nothing dispatched yet.'
                    : transport.delivery.missing.length
                      ? transport.delivery.missing.length === transport.delivery.items.length
                        ? transport.delivery.items.length === 1
                          ? 'This dispatch needs a distance or destination.'
                          : 'These dispatches need a distance or destination.'
                        : `${transport.delivery.missing.length} of ${transport.delivery.items.length} dispatches need a distance or destination.`
                      : `${transport.delivery.massT} t, mass-weighted ${transport.delivery.meanKm} km, ${transport.delivery.tonneKm} t·km`}
                </p>
                {transport.delivery.items.map((d) => (
                  <div key={d.id} className="dp-row transport-row transport-row--delivery" data-testid="delivery-row">
                    <span>{d.toName}</span>
                    <span className="num">{fmtKg(d.massKg)}</span>
                    <Km d={d} />
                    <SetDelivery id={d.id} toName={d.toName} />
                  </div>
                ))}
                <p className="muted transport-sum" data-testid="ledger-transport">
                  {transport.ledger
                    ? `The ledger's transport line uses ${transport.ledger.transportKm} km for ${transport.ledger.transportMassT} t from the run inputs.`
                    : 'No run inputs yet, so the ledger has no transport line.'}
                </p>
                {transport.ledger &&
                  transport.delivery.items.length > 0 &&
                  transport.delivery.missing.length === 0 &&
                  transport.delivery.meanKm !== null &&
                  (transport.delivery.meanKm !== transport.ledger.transportKm ||
                    transport.delivery.massT !== transport.ledger.transportMassT) && (
                    <ApplyDelivery code={batch.id} km={transport.delivery.meanKm} massT={transport.delivery.massT} />
                  )}
              </section>
            </div>
          </CardBody>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <LinkButton href={`/console/ledger/${batch.id}`} variant="solid">
          Open the carbon ledger
        </LinkButton>
        <LinkButton href="/console/lab" variant="outline">
          Lab results
        </LinkButton>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 'var(--t-caption)' }}>
        Opened {fmtDate(batch.openedAt)}, {batch.closedAt ? `closed ${fmtDate(batch.closedAt)}` : 'still open'}
        {batch.gps ? ' · reactor GPS on file (G-1CDW-0)' : ' · no reactor GPS yet'}
        {batch.ops ? ` · run inputs on file` : ' · run inputs missing for the ledger'}
        {operators.length > 0 && (
          <>
            {' · run by '}
            <Link href="/console/shifts" data-testid="batch-operators">
              {operators.join(', ')}
            </Link>
          </>
        )}
      </p>
    </>
  )
}
