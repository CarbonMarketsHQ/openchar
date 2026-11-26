import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import { IconCrosshair } from '../icons'

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds the drawn registration corner and a stronger edge. */
  frame?: boolean
  children: ReactNode
}

/**
 * The panel. Plain by default; framed when the content is a reading rather
 * than a container — a set of figures, a record, a result. The crosshair is
 * the system's only ornament and it earns its place by marking which panels
 * are instruments.
 */
export function Card({ frame, className, children, ...rest }: CardProps) {
  return (
    <div className={cx('ui-card', className)} data-frame={frame || undefined} {...rest}>
      {frame && <IconCrosshair className="ui-card__cross" />}
      {children}
    </div>
  )
}

export function CardHead({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('ui-card__head', className)} {...rest}>
      {children}
    </div>
  )
}

/**
 * The title of a card, in sans at sentence case.
 *
 * Not an uppercase mono stamp. A stamp classifies — "ISSUED", "GS3838" — and
 * a title is read; setting every panel heading as a stamp is what makes a
 * dense screen shout. `.u-label` is still there when a stamp is the point.
 */
export function CardTitle({ desc, children }: { desc?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="ui-card__title">{children}</div>
      {desc && <div className="ui-card__desc">{desc}</div>}
    </div>
  )
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('ui-card__body', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardFoot({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('ui-card__foot', className)} {...rest}>
      {children}
    </div>
  )
}

/**
 * Key and value rows. A definition list rather than a two-column grid of
 * divs, because that is what the content is, and it is what a screen reader
 * needs to pair the two.
 */
export function KeyValues({
  items,
  className,
}: {
  items: { label: ReactNode; value: ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cx('ui-kv', className)}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
