import { cx } from '../cx'

/**
 * A rule. Decorative by default, which is the honest answer: a line between
 * two blocks is not a landmark, and announcing it as one adds noise. Pass
 * label when the division genuinely names a new group.
 */
export function Separator({
  orientation = 'horizontal',
  strong,
  label,
  className,
}: {
  orientation?: 'horizontal' | 'vertical'
  strong?: boolean
  label?: string
  className?: string
}) {
  return (
    <div
      className={cx('ui-sep', className)}
      data-orientation={orientation}
      data-strong={strong || undefined}
      role={label ? 'separator' : undefined}
      aria-orientation={label ? orientation : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}

/**
 * The ruled scale. A divider that says the page is an instrument — the same
 * drawing as the rails on the public site, at 12px minor and 120px major.
 */
export function TickScale({ className }: { className?: string }) {
  return <div className={cx('ui-ticks', className)} aria-hidden="true" />
}
