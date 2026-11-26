'use client'

import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cx } from '../cx'

/**
 * Label, control, hint and error as one unit.
 *
 * The wiring is the point: Field generates the id, points the label at the
 * control, and hangs the hint off aria-describedby so a screen reader reads
 * the requirement before the user types rather than after they fail.
 */

export function Label({
  htmlFor,
  required,
  children,
  className,
}: {
  htmlFor?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('ui-fieldlabel', className)} htmlFor={htmlFor}>
      {children}
      {required && (
        <span className="ui-fieldlabel__req" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
}

export function Hint({
  tone,
  id,
  children,
  className,
}: {
  tone?: 'negative'
  id?: string
  children: ReactNode
  className?: string
}) {
  return (
    <p id={id} className={cx('ui-hint', className)} data-tone={tone}>
      {children}
    </p>
  )
}

export type FieldProps = {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  /** Receives the id and the describedby to put on the control. */
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }) => ReactNode
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const base = useId()
  const id = `${base}-control`
  const noteId = `${base}-note`
  const note = error ?? hint

  return (
    <div className={cx('ui-field', className)}>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      {children({
        id,
        'aria-describedby': note ? noteId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {note && (
        <Hint id={noteId} tone={error ? 'negative' : undefined}>
          {note}
        </Hint>
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx('ui-input', className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx('ui-textarea', className)} {...rest} />
  },
)

/**
 * An input with a unit or an icon inside its own edge — "t CO2e", a search
 * mark, a currency. The affix sits behind a hairline so it reads as part of
 * the instrument rather than as content the user typed.
 */
export function InputGroup({
  prefix,
  suffix,
  className,
  children,
}: {
  prefix?: ReactNode
  suffix?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cx('ui-inputwrap', className)}>
      {prefix && (
        <span className="ui-inputwrap__affix" data-side="start">
          {prefix}
        </span>
      )}
      {children}
      {suffix && (
        <span className="ui-inputwrap__affix" data-side="end">
          {suffix}
        </span>
      )}
    </div>
  )
}
