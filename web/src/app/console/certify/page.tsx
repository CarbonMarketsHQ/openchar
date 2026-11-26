import { Card, CardBody, CardHead, CardTitle, Notice } from '@/design'
import { api, type BatchRow } from '@/lib/api'
import { DataFallback, EmptyState, fmtDate } from '../bits'
import { statusLabel } from '@/lib/labels'
import { SubmitStatement } from './submit'

type Preview = { mode: string; config?: string; note: string; payload: Record<string, unknown> }
type Submission = { id: number; batchId: string; payloadHash: string; mode: string; createdAt: string }

export default async function Certify() {
  const batches = await api<BatchRow[]>('/batches')
  if (!batches) return <DataFallback />
  const ready = batches.find((b) => b.status === 'sampled')
  const [preview, submissions] = await Promise.all([
    ready ? api<Preview>(`/certify/preview/${ready.id}`, { method: 'POST' }) : null,
    api<Submission[]>('/certify/submissions'),
  ])

  return (
    <>
      <div className="page-head">
        <h1>Certify</h1>
        <p className="sub">
          The batch evidence mapped onto Isometric Certify's objects: feedstock batch, production
          batch, measurement samples, sensor series, GHG entry.
        </p>
      </div>

      <Notice tone={preview?.mode === 'live' ? 'positive' : 'caution'} title={preview?.mode === 'live' ? 'Live: Isometric sandbox' : 'Mock mode'}>
        <span data-testid="certify-mode">
          {preview?.config ??
            'This connector mirrors the Certify API shapes. Configure Isometric credentials to go live; nothing else changes.'}
        </span>
      </Notice>

      {!ready || !preview ? (
        <EmptyState title="No batch is statement-ready yet">
          A batch needs to be closed, sampled and certified before a GHG statement can be drafted.
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardHead>
              <CardTitle desc={preview.note}>Statement payload · {ready.id}</CardTitle>
            </CardHead>
            <CardBody>
              <pre
                data-testid="certify-payload"
                className="mono"
                style={{
                  margin: 0,
                  padding: 'var(--sp-4)',
                  background: 'var(--surface-sunken)',
                  border: 'var(--border) solid var(--hairline)',
                  borderRadius: 'var(--radius-sm)',
                  overflowX: 'auto',
                  fontSize: 'var(--t-caption)',
                  lineHeight: 1.55,
                  maxHeight: 420,
                }}
              >
                {JSON.stringify(preview.payload, null, 2)}
              </pre>
            </CardBody>
          </Card>
          <SubmitStatement batchId={ready.id} />
        </>
      )}

      <Card>
        <CardHead>
          <CardTitle desc="Each submission is hashed, so what was sent is provable later.">Submissions</CardTitle>
        </CardHead>
        <CardBody>
          {!submissions || submissions.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Nothing submitted yet.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
              {submissions.map((s) => (
                <div key={s.id} className="dp-row" data-testid="submission-row">
                  <span className="mono">{s.batchId}</span>
                  <span className="mono muted">{s.payloadHash.slice(0, 12)}…</span>
                  <span className="muted">{statusLabel(s.mode)}</span>
                  <span className="muted">{fmtDate(s.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  )
}
