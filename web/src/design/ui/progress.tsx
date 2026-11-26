import type { ReactNode } from 'react'
import { cx } from '../cx'

/**
 * How far along something is.
 *
 * value is 0 to 1, or undefined when the answer is genuinely unknown — in
 * which case the bar shuttles rather than inventing a percentage. A progress
 * bar that guesses is the reason nobody believes progress bars.
 */
export function Progress({
  value,
  label,
  detail,
  tone,
  className,
}: {
  value?: number
  label?: ReactNode
  /** Right of the label: "4 of 12", "38 s left". */
  detail?: ReactNode
  tone?: 'positive' | 'negative'
  className?: string
}) {
  const pct = value === undefined ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100)

  return (
    <div
      className={cx('ui-progress', className)}
      data-tone={tone}
      data-indeterminate={pct === undefined || undefined}
    >
      {(label || detail) && (
        <div className="ui-progress__head">
          <span>{label}</span>
          <span>{detail ?? (pct !== undefined ? `${pct}%` : null)}</span>
        </div>
      )}
      <div
        className="ui-progress__track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={pct === undefined ? undefined : 0}
        aria-valuemax={pct === undefined ? undefined : 100}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div className="ui-progress__fill" style={{ width: pct === undefined ? undefined : `${pct}%` }} />
      </div>
    </div>
  )
}
