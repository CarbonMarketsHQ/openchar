'use client'

/**
 * F_durable against H/Corg at the site's soil temperature: what a cleaner
 * char is worth. Woolf 2021 parameters as in the Soil Environments module.
 */
const A = -0.383
const B = 0.35
const C = -0.048

const W = 360
const H = 216
const M = { top: 34, right: 18, bottom: 56, left: 44 }

export function DurabilityCurve({ tSoilC, hCorg, f }: { tSoilC: number; hCorg: number; f: number }) {
  const t = Math.max(7, tSoilC)
  const fOf = (h: number) => Math.min(0.95, Math.max(0, 1 - (C + (A + B * Math.log(t)) * h)))
  const x = (h: number) => M.left + (h / 0.5) * (W - M.left - M.right)
  const y = (v: number) => M.top + (1 - v) * (H - M.top - M.bottom)

  const pts: string[] = []
  for (let h = 0; h <= 0.5001; h += 0.01) {
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${x(h).toFixed(1)},${y(fOf(h)).toFixed(1)}`)
  }
  const px = x(hCorg)
  const py = y(f)
  const right = px < (M.left + W - M.right) / 2
  const base = H - M.bottom

  return (
    <div className="chart chart--compact">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Durability factor falls as H over C rises; this batch sits at ${hCorg} and ${(f * 100).toFixed(0)} percent`}>
        <text x={M.left - 10} y={14} className="axis-title">
          Durable fraction
        </text>
        {[0.5, 1].map((v) => (
          <g key={v}>
            <line className="grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
            <text x={M.left - 10} y={y(v) + 5} textAnchor="end">
              {v === 1 ? '1.0' : v}
            </text>
          </g>
        ))}
        <line className="axis" x1={M.left} x2={W - M.right} y1={base} y2={base} />
        <line className="guide" x1={px} x2={px} y1={py} y2={base} />
        <line className="guide" x1={M.left} x2={px} y1={py} y2={py} />
        <path className="series" d={pts.join('')} />
        <circle cx={px} cy={py} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        {/* The curve falls left to right, so the space below-left of the
            point (or below-right, for a low H/Corg) is always clear. */}
        <text x={right ? px + 12 : px - 12} y={py + 26} textAnchor={right ? 'start' : 'end'} className="callout-ink">
          This batch · {f.toFixed(2)}
        </text>
        {[0, 0.25, 0.5].map((h) => (
          <text key={h} x={x(h)} y={base + 22} textAnchor={h === 0 ? 'start' : h === 0.5 ? 'end' : 'middle'}>
            {h}
          </text>
        ))}
        <text x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle" className="axis-title">
          H/Corg (molar ratio)
        </text>
      </svg>
    </div>
  )
}
