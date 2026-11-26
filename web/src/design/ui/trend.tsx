import { cx } from '../cx'

export type Series = {
  name: string
  values: number[]
  /** A --viz-N token by default; any CSS colour works. */
  color?: string
}

/**
 * A reading over time.
 *
 * Straight segments, never smoothed. A curve drawn between two measurements
 * is a claim about a value nobody recorded, and this system is for a market
 * where that distinction is the whole product. The same reason there is no
 * area gradient fading into nothing: the fill stops where the data stops.
 *
 * The viewBox is a unit box stretched with preserveAspectRatio="none", so the
 * chart fills any column; non-scaling-stroke in the stylesheet keeps the line
 * one weight while it does.
 */
export function Trend({
  series,
  labels,
  height = 200,
  max: fixedMax,
  caption,
  className,
}: {
  series: Series[]
  /** X ticks. Rendered under the plot, first and last aligned to the edges. */
  labels?: string[]
  height?: number
  max?: number
  /** The accessible description. Without it the chart is announced as an image with no content. */
  caption?: string
  className?: string
}) {
  const all = series.flatMap((s) => s.values)
  const max = fixedMax ?? Math.max(1, ...all)
  const len = Math.max(...series.map((s) => s.values.length), 2)

  // Unit space: 0..100 across, 0..100 down, y inverted so bigger is higher.
  const x = (i: number) => (i / (len - 1)) * 100
  const y = (v: number) => 100 - (v / max) * 100

  return (
    <figure className={cx(className)}>
      {series.length > 1 && (
        <figcaption className="ui-trend__key">
          {series.map((s, i) => (
            <span className="ui-trend__keyitem" key={s.name}>
              <span
                className="ui-trend__swatch"
                style={{ background: s.color ?? `var(--viz-${(i % 5) + 1})` }}
              />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}

      <svg
        className="ui-trend"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        height={height}
        width="100%"
        role="img"
        aria-label={caption ?? series.map((s) => s.name).join(', ')}
      >
        {[0, 25, 50, 75, 100].map((g) => (
          <line className="ui-trend__grid" key={g} x1="0" x2="100" y1={g} y2={g} vectorEffect="non-scaling-stroke" />
        ))}

        {series.map((s, i) => {
          const colour = s.color ?? `var(--viz-${(i % 5) + 1})`
          const points = s.values.map((v, j) => `${x(j)},${y(v)}`).join(' ')
          return (
            <g key={s.name}>
              <polygon points={`0,100 ${points} ${x(s.values.length - 1)},100`} fill={colour} opacity="0.16" />
              <polyline className="ui-trend__line" points={points} stroke={colour} />
            </g>
          )
        })}
      </svg>

      {labels && labels.length > 0 && (
        <div className="ui-trend__axis" aria-hidden="true">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </figure>
  )
}
