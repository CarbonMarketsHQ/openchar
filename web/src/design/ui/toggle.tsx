'use client'

import { useEffect, useRef } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import { IconCheck, IconMinus } from '../icons'

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  children?: ReactNode
  /** A second line under the label. Wired into the control's own label. */
  description?: ReactNode
  className?: string
}

/**
 * Checkbox and switch, both built on a real <input type="checkbox">.
 *
 * A div with role="checkbox" would need every one of these for free: form
 * participation, the space key, the browser's own autofill and validation,
 * indeterminate state, and the label click target. The input is visually
 * hidden and the box next to it is drawn, which keeps all of that.
 */
export function Checkbox({
  children,
  description,
  className,
  indeterminate,
  disabled,
  ...rest
}: ToggleProps & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)

  // Indeterminate exists only as a DOM property; there is no attribute for it.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate)
  }, [indeterminate])

  return (
    <label className={cx('ui-check', className)} data-disabled={disabled || undefined}>
      <input
        ref={ref}
        type="checkbox"
        className="ui-check__input"
        disabled={disabled}
        aria-checked={indeterminate ? 'mixed' : undefined}
        {...rest}
      />
      <span className="ui-check__box">
        {indeterminate ? (
          <IconMinus className="ui-check__mark" size={12} />
        ) : (
          <IconCheck className="ui-check__mark" size={12} />
        )}
      </span>
      {children && (
        <span className="ui-check__text">
          {children}
          {description && <span className="ui-check__desc">{description}</span>}
        </span>
      )}
    </label>
  )
}

export function Switch({ children, description, className, disabled, ...rest }: ToggleProps) {
  return (
    <label className={cx('ui-check', className)} data-disabled={disabled || undefined}>
      <input type="checkbox" role="switch" className="ui-check__input" disabled={disabled} {...rest} />
      <span className="ui-switch__track">
        <span className="ui-switch__thumb" />
      </span>
      {children && (
        <span className="ui-check__text">
          {children}
          {description && <span className="ui-check__desc">{description}</span>}
        </span>
      )}
    </label>
  )
}
