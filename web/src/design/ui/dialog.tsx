'use client'

import * as D from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { usePortalSurface } from '../context'
import { IconX } from '../icons'

/**
 * The modal, on Radix.
 *
 * Focus trapping, scroll locking, Escape, the inert background and the return
 * of focus to whatever opened it are all things that are wrong in most
 * hand-rolled dialogs and are worth a dependency to get right. The visible
 * part is entirely ours.
 */

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({
  title,
  description,
  size,
  footer,
  className,
  children,
}: {
  title: ReactNode
  /** Optional, but a dialog that opens with no stated purpose is a puzzle. */
  description?: ReactNode
  size?: 'wide'
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  const overlay = usePortalSurface('ui-overlay')
  const content = usePortalSurface('ui-dialog', className)

  return (
    <D.Portal>
      <D.Overlay {...overlay} />
      <D.Content {...content} data-size={size}>
        <div className="ui-dialog__head">
          <div>
            <D.Title className="ui-dialog__title">{title}</D.Title>
            {description ? (
              <D.Description className="ui-dialog__desc">{description}</D.Description>
            ) : (
              // Radix warns without one, and an aria-describedby pointing at
              // nothing is worse than none at all.
              <D.Description className="u-sr">{typeof title === 'string' ? title : 'Dialog'}</D.Description>
            )}
          </div>
          <D.Close className={cx('ui-btn')} data-variant="ghost" data-size="icon-sm" aria-label="Close">
            <IconX />
          </D.Close>
        </div>

        <div className="ui-dialog__body">{children}</div>

        {footer && <div className="ui-dialog__foot">{footer}</div>}
      </D.Content>
    </D.Portal>
  )
}
