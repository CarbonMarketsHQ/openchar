'use client'

/**
 * F_durable against H/Corg at the site's soil temperature: what a cleaner
 * char is worth. Woolf 2021 parameters as in the Soil Environments module.
 */
const A = -0.383
const B = 0.35
const C = -0.048

const W = 360
const H = 180
const M = { top: 14, right: 16, bottom: 28, left: 40 }

export function DurabilityCurve({ tSoilC, hCorg, f }: { tSoilC: number; hCorg: number; f: number }) {
  const t = Math.max(7, tSoilC)
  const fOf = (h: number) => Math.min(0.95, Math.max(0, 1 - (C + (A + B * Math.log(t)) * h)))
  const x = (h: number) => M.left + (h / 0.5) * (W - M.left - M.right)
  const y = (v: number) => M.top + (1 - v) * (H - M.top - M.bottom)

  const pts: string[] = []
  for (let h = 0; h <= 0.5001; h += 0.01) {
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${x(h).toFixed(1)},${y(fOf(h)).toFixed(1)}`)
  }

  return (
    <div className="chart chart--compact">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Durability factor falls as H over C rises; this batch sits at ${hCorg} and ${(f * 100).toFixed(0)} percent`}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line className="grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
            <text x={M.left - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <path className="series" d={pts.join('')} />
        <circle cx={x(hCorg)} cy={y(f)} r={5} fill="var(--accent)" stroke="var(--base)" strokeWidth={2} />
        <text x={Math.min(x(hCorg) + 8, W - 90)} y={y(f) - 8}>
          this batch · {f.toFixed(2)}
        </text>
        <line className="axis" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        {[0, 0.25, 0.5].map((h) => (
          <text key={h} x={x(h)} y={H - 10} textAnchor="middle">
            {h}
          </text>
        ))}
        <text x={W - M.right} y={M.top + 4} textAnchor="end">
          H/Corg →
        </text>
      </svg>
    </div>
  )
}
