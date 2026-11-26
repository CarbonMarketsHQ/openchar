import type { CSSProperties } from 'react'
import { cx } from '../cx'

/**
 * A placeholder with the shape of the thing that is coming. Sized by the
 * caller, because a skeleton that does not match the real block's height is
 * a layout shift with extra steps.
 *
 * The sweep stops entirely under prefers-reduced-motion; see system.css.
 */
export function Skeleton({
  width,
  height = '1em',
  className,
  style,
}: {
  width?: number | string
  height?: number | string
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={cx('ui-skeleton', className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}

/** Several lines of it, with a short last line the way real text ends. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={cx(className)}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height="0.9em" width={i === lines - 1 ? '58%' : '100%'} />
      ))}
    </div>
  )
}
