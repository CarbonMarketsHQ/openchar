import type { Distance } from '@/lib/api'

/** "24 km est." or "31 km", or a dash when either end has no coordinates. */
export function Km({ d }: { d?: Distance }) {
  if (!d || d.km === null) return <span className="muted">–</span>
  return (
    <span className="km" data-testid="distance" data-source={d.source}>
      {d.km.toLocaleString('en-GB', { maximumFractionDigits: 1 })} km
      {d.source === 'estimate' && (
        <span className="km-est" title="Straight-line distance times 1.3 for roads">
          {' '}
          est.
        </span>
      )}
    </span>
  )
}
