import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'

export type Tone = 'neutral' | 'positive' | 'caution' | 'negative' | 'info'

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
  variant?: 'soft' | 'outline' | 'solid' | 'dashed'
  /** A status light before the label, in the tone's own colour. */
  dot?: boolean
  children: ReactNode
}

/**
 * The stamp. Mono, uppercase and small, because it is a classification and
 * not a sentence — the moment a badge takes running text it should have been
 * a Notice instead.
 *
 * Soft by default: a tinted ground and no edge. An outlined box around every
 * status is what turns a list of ten rows into a grid of forty rectangles.
 * Reach for `outline` when a badge has to read as a drawn object — one stamp
 * on a page, not one per row.
 *
 * Dashed carries one meaning across the whole system: still in flight.
 */
export function Badge({ tone = 'neutral', variant = 'soft', dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx('ui-badge', className)}
      data-tone={tone === 'neutral' ? undefined : tone}
      data-variant={variant === 'soft' ? undefined : variant}
      {...rest}
    >
      {dot && <span className="ui-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  )
}
