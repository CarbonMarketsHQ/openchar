'use client'

import * as M from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { usePortalSurface } from '../context'

/**
 * The overflow menu, on Radix.
 *
 * Same reasoning as Select: typeahead, the collision-aware popper, focus
 * return and the pointer-versus-keyboard highlight rules are all things a
 * hand-rolled menu gets subtly wrong. This dresses the primitive.
 */

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({
  align = 'end',
  children,
}: {
  align?: 'start' | 'center' | 'end'
  children: ReactNode
}) {
  const surface = usePortalSurface('ui-menu')
  return (
    <M.Portal>
      <M.Content {...surface} align={align} sideOffset={4}>
        {children}
      </M.Content>
    </M.Portal>
  )
}

export function MenuItem({
  icon,
  shortcut,
  tone,
  disabled,
  onSelect,
  children,
}: {
  icon?: ReactNode
  shortcut?: string
  tone?: 'negative'
  disabled?: boolean
  onSelect?: () => void
  children: ReactNode
}) {
  return (
    <M.Item className="ui-menu__item" data-tone={tone} disabled={disabled} onSelect={onSelect}>
      {icon}
      <span>{children}</span>
      {shortcut && <span className="ui-menu__shortcut">{shortcut}</span>}
    </M.Item>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="ui-menu__label">{children}</M.Label>
}

export function MenuSeparator() {
  return <M.Separator className="ui-menu__sep" />
}
