'use client'

import * as S from '@radix-ui/react-select'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { usePortalSurface } from '../context'
import { IconCheck, IconChevronDown } from '../icons'

/**
 * A select, on Radix.
 *
 * The native <select> cannot be styled to this system on every platform, and
 * a hand-built listbox has to reimplement typeahead, the collision-aware
 * popper, pointer-vs-keyboard highlight rules and the form association. This
 * wraps the primitive and dresses it; it does not rebuild it.
 */

export function Select({
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  disabled,
  name,
  id,
  className,
  ariaDescribedBy,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  placeholder?: string
  disabled?: boolean
  name?: string
  id?: string
  className?: string
  ariaDescribedBy?: string
  children: ReactNode
}) {
  const menu = usePortalSurface('ui-selectmenu')

  return (
    <S.Root value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled} name={name}>
      <S.Trigger id={id} aria-describedby={ariaDescribedBy} className={cx('ui-select', className)}>
        <S.Value placeholder={placeholder} />
        <S.Icon className="ui-select__icon">
          <IconChevronDown />
        </S.Icon>
      </S.Trigger>

      <S.Portal>
        {/* popper, not item-aligned: the menu then knows the trigger's width
            and the room it has, which is what --radix-select-trigger-width
            and the max-height in the stylesheet read from */}
        <S.Content {...menu} position="popper" sideOffset={4}>
          <S.Viewport className="ui-selectmenu__viewport">{children}</S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}

export function SelectItem({
  value,
  disabled,
  children,
}: {
  value: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <S.Item value={value} disabled={disabled} className="ui-selectmenu__item">
      <span className="ui-selectmenu__tick">
        <S.ItemIndicator>
          <IconCheck size={12} />
        </S.ItemIndicator>
      </span>
      <S.ItemText>{children}</S.ItemText>
    </S.Item>
  )
}

export function SelectGroup({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <S.Group>
      <S.Label className="ui-selectmenu__label">{label}</S.Label>
      {children}
    </S.Group>
  )
}

export function SelectSeparator() {
  return <S.Separator className="ui-selectmenu__sep" />
}
