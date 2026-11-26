/** Monthly emissions as stacked bars, one colour per scope, drawn to one scale. */
type Month = { month: string; scope1: number; scope2: number; scope3: number }

const W = 1000
const H = 260
const M = { top: 16, right: 12, bottom: 34, left: 56 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

export function ScopeChart({ months, unit }: { months: Month[]; unit: 'kg' | 't' }) {
  const k = unit === 'kg' ? 1000 : 1
  const totals = months.map((m) => (m.scope1 + m.scope2 + m.scope3) * k)
  const max = niceMax(Math.max(...totals))
  const iw = W - M.left - M.right
  const ih = H - M.top - M.bottom
  const y = (v: number) => M.top + ih - (v / max) * ih
  const slot = iw / months.length
  const bw = Math.min(64, slot * 0.5)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('en-GB') : v.toLocaleString('en-GB', { maximumFractionDigits: 1 }))
  const label = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="scope-chart" role="img" aria-label="Emissions by month and scope" data-testid="scope-chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="scope-grid" />
          <text x={M.left - 8} y={y(t)} className="scope-tick" textAnchor="end" dominantBaseline="middle">
            {fmt(t)}
          </text>
        </g>
      ))}
      <text x={12} y={M.top + ih / 2} className="scope-tick" textAnchor="middle" transform={`rotate(-90 12 ${M.top + ih / 2})`}>
        {unit === 'kg' ? 'kg CO2e' : 't CO2e'}
      </text>
      {months.map((m, i) => {
        const x = M.left + slot * i + (slot - bw) / 2
        let base = 0
        const parts = (['scope1', 'scope2', 'scope3'] as const).map((s) => {
          const v = m[s] * k
          const part = { s, y0: base, y1: base + v }
          base += v
          return part
        })
        return (
          <g key={m.month} data-testid="scope-bar" data-month={m.month}>
            {parts
              .filter((p) => p.y1 > p.y0)
              .map((p) => (
                <rect key={p.s} x={x} width={bw} y={y(p.y1)} height={Math.max(0.5, y(p.y0) - y(p.y1))} className={`scope-${p.s}`}>
                  <title>{`${label(m.month)}: ${fmt(p.y1 - p.y0)} ${unit} CO2e, scope ${p.s.slice(-1)}`}</title>
                </rect>
              ))}
            <text x={x + bw / 2} y={H - M.bottom + 18} textAnchor="middle" className="scope-tick">
              {label(m.month)}
            </text>
          </g>
        )
      })}
      <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} className="scope-axis" />
    </svg>
  )
}
