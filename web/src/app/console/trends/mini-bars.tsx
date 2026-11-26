/** One metric across batches: a bar per batch, its value on top, and a dashed
 * outline where the batch lacks the record the figure needs. */
export function MiniBars({
  items,
  unit,
  digits = 0,
  testId,
}: {
  items: { label: string; value: number | null }[]
  unit: string
  digits?: number
  testId?: string
}) {
  const W = 360
  const H = 150
  const M = { top: 22, bottom: 24, side: 8 }
  const max = Math.max(1, ...items.map((i) => i.value ?? 0))
  const slot = (W - M.side * 2) / Math.max(1, items.length)
  const bw = Math.min(48, slot * 0.55)
  const ih = H - M.top - M.bottom
  const fmt = (v: number) => v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mini-bars" role="img" aria-label={`By batch, in ${unit}`} data-testid={testId}>
      <line x1={M.side} x2={W - M.side} y1={M.top + ih} y2={M.top + ih} className="scope-axis" />
      {items.map((it, i) => {
        const x = M.side + slot * i + (slot - bw) / 2
        if (it.value === null) {
          return (
            <g key={it.label} data-testid="mini-bar" data-empty="true">
              <rect x={x} y={M.top + ih - 18} width={bw} height={18} className="mini-gap" />
              <text x={x + bw / 2} y={M.top + ih - 24} textAnchor="middle" className="scope-tick">
                no data
              </text>
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="scope-tick mono">
                {it.label}
              </text>
            </g>
          )
        }
        const h = Math.max(1, (it.value / max) * ih)
        return (
          <g key={it.label} data-testid="mini-bar" data-value={it.value}>
            <rect x={x} y={M.top + ih - h} width={bw} height={h} className="mini-fill">
              <title>{`${it.label}: ${fmt(it.value)} ${unit}`}</title>
            </rect>
            <text x={x + bw / 2} y={M.top + ih - h - 6} textAnchor="middle" className="mini-val">
              {fmt(it.value)}
            </text>
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="scope-tick mono">
              {it.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
