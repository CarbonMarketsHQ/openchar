'use client'

import { useMemo, useRef, useState } from 'react'

type Point = { minute: number; tempC: number }
type Anomaly = { kind: string; fromMinute: number; toMinute: number; minTempC: number }

const W = 720
const H = 240
const M = { top: 18, right: 14, bottom: 26, left: 44 }

/**
 * Reactor temperature over a run. Single series: the title names it, so no
 * legend. The anomaly window is a labelled band, never colour alone, and a
 * crosshair tooltip rides the pointer.
 */
export function TempChart({ points, anomalies }: { points: Point[]; anomalies: Anomaly[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Point | null>(null)

  const maxMinute = points.length ? points[points.length - 1].minute : 1
  const maxTemp = 650
  const x = (minute: number) => M.left + (minute / maxMinute) * (W - M.left - M.right)
  const y = (temp: number) => M.top + (1 - temp / maxTemp) * (H - M.top - M.bottom)

  const path = useMemo(
    () => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minute).toFixed(1)},${y(p.tempC).toFixed(1)}`).join(''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points]
  )

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const minute = Math.round(((px - M.left) / (W - M.left - M.right)) * maxMinute)
    const p = points.find((q) => q.minute === Math.max(0, Math.min(maxMinute, minute)))
    setHover(p ?? null)
  }

  const ticks = [0, 150, 300, 450, 600]
  return (
    <div className="chart" data-testid="temp-chart" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Reactor temperature over ${maxMinute} minutes, peaking near 560 degrees`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {anomalies.map((a) => (
          <g key={a.fromMinute}>
            <rect
              data-testid="anomaly-marker"
              className="band"
              x={x(a.fromMinute)}
              y={M.top}
              width={Math.max(4, x(a.toMinute) - x(a.fromMinute))}
              height={H - M.top - M.bottom}
            />
            <line className="band-edge" x1={x(a.fromMinute)} x2={x(a.fromMinute)} y1={M.top} y2={H - M.bottom} />
            <line className="band-edge" x1={x(a.toMinute)} x2={x(a.toMinute)} y1={M.top} y2={H - M.bottom} />
            <text className="callout" x={x((a.fromMinute + a.toMinute) / 2)} y={M.top - 6} textAnchor="middle">
              below 400°C · {a.fromMinute}–{a.toMinute} min
            </text>
          </g>
        ))}
        <path className="series" d={path} />
        <line className="axis" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        {[0, 60, 120, maxMinute].filter((v, i, arr) => arr.indexOf(v) === i && v <= maxMinute).map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle">
            {t}m
          </text>
        ))}
        {hover && (
          <g>
            <line className="band-edge" x1={x(hover.minute)} x2={x(hover.minute)} y1={M.top} y2={H - M.bottom} />
            <circle cx={x(hover.minute)} cy={y(hover.tempC)} r={4} fill="var(--viz-4)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover && ref.current && (
        <div
          className="chart-tip"
          style={{
            left: `${(x(hover.minute) / W) * 100}%`,
            top: `${(y(hover.tempC) / H) * 100}%`,
          }}
        >
          {hover.minute} min · {hover.tempC.toFixed(0)}°C
        </div>
      )}
    </div>
  )
}
