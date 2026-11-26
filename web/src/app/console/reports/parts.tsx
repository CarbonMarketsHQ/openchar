import type { ReactNode } from 'react'

export const fmtNum = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '–' : v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })
/** Up to four decimals, without trailing zeros: 1.025, 1,250, 0.0001. */
export const fmtVal = (v: number | null | undefined) =>
  v === null || v === undefined ? '–' : v.toLocaleString('en-GB', { maximumFractionDigits: 4 })
/** A mass with its unit, or a dash when there is none. */
export const kg = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${fmtNum(v)} kg`)
export const fmtDay = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–'
export const fmtTime = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC'
    : '–'

export function ReportHead({ title, sub, project, generatedAt, synthetic }: { title: string; sub: string; project: string; generatedAt: string; synthetic: boolean }) {
  return (
    <header className="report-head">
      <div>
        <p className="report-kicker">OpenChar report</p>
        <h1>{title}</h1>
        <p className="report-sub">{sub}</p>
      </div>
      <dl className="report-meta">
        <dt>Project</dt>
        <dd>{project}</dd>
        <dt>Generated</dt>
        <dd>{fmtTime(generatedAt)}</dd>
        {synthetic && (
          <>
            <dt>Data</dt>
            <dd>Synthetic, for demonstration</dd>
          </>
        )}
      </dl>
    </header>
  )
}

export function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="report-section" data-testid={testId}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function Table({ head, rows, numeric = [] }: { head: string[]; rows: ReactNode[][]; numeric?: number[] }) {
  if (rows.length === 0) return <p className="report-empty">None recorded.</p>
  return (
    <table className="report-table">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} data-numeric={numeric.includes(i) || undefined}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, i) => (
              <td key={i} data-numeric={numeric.includes(i) || undefined}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="report-facts">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
