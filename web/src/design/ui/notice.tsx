import type { ReactNode } from 'react'
import { cx } from '../cx'
import type { Tone } from './badge'
import { IconAlert, IconCheck, IconInfo } from '../icons'

const MARK: Record<Tone, ReactNode> = {
  neutral: <IconInfo />,
  info: <IconInfo />,
  positive: <IconCheck />,
  caution: <IconAlert />,
  negative: <IconAlert />,
}

/**
 * An inline statement about the state of things: what failed, what saved,
 * what the user should know before they act.
 *
 * The icon is never the only carrier of the meaning — tone changes the edge
 * and the ground as well, so it survives a monochrome print and a colour
 * vision deficiency alike.
 */
export function Notice({
  tone = 'neutral',
  title,
  className,
  children,
}: {
  tone?: Tone
  title?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cx('ui-notice', className)}
      data-tone={tone === 'neutral' ? undefined : tone}
      role={tone === 'negative' ? 'alert' : 'status'}
    >
      <span className="ui-notice__mark">{MARK[tone]}</span>
      <div>
        {title && <div className="ui-notice__title">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  )
}
