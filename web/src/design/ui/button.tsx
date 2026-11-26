'use client'

import { forwardRef } from 'react'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cx } from '../cx'

export type ButtonVariant = 'outline' | 'solid' | 'ghost' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

type BaseProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows the ticks alongside the label and blocks the click. */
  loading?: boolean
  /** Hands every prop to the single child instead — a Link, usually. */
  asChild?: boolean
  children?: ReactNode
}

export type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>

/**
 * The control. Outline is the default because on this ground a filled button
 * is a claim, and most buttons are not making one — the accent fill is
 * reserved for the single action a screen actually wants.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', loading, asChild, className, children, disabled, type, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      // A <button> with no type is a submit button. Inside a form — which is
      // where half of these live — that means every Cancel silently submits.
      // Opt in to submit, never inherit it.
      type={asChild ? undefined : (type ?? 'button')}
      className={cx('ui-btn', className)}
      data-variant={variant}
      data-size={size === 'md' ? undefined : size}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      {...rest}
    >
      {/* asChild has to receive exactly one child — Slot calls Children.only,
          and a `{loading && …}` sibling makes two even when it is false.
          A link is never in a loading state anyway, so it just gets the child.

          Otherwise the label stays and the ticks sit beside it: swapping the
          label for a spinner collapses the button to the width of the spinner,
          which moves everything next to it at the exact moment the user is
          waiting to see whether anything happened. */}
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Ticks />}
          {children}
        </>
      )}
    </Comp>
  )
})

/** The three sweeping ticks, shared by Button and Loader. */
export function Ticks({ className }: { className?: string }) {
  return (
    <span className={cx('ui-loader__ticks', className)} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * The travelling arrow. Two characters of text, not an icon, so it sets on
 * the type baseline — and inline-block plus nowrap in the stylesheet, because
 * a wrapped label was otherwise ending a line on the hyphen.
 */
export function Glyph({ children = '->' }: { children?: ReactNode }) {
  return (
    <span className="ui-btn__glyph" aria-hidden="true">
      {children}
    </span>
  )
}

/** Buttons that share an edge and read as one instrument. */
export function ButtonGroup({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('ui-btngroup', className)} role="group">
      {children}
    </div>
  )
}

export type LinkButtonProps = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement>

/** The same control as an anchor, for the cases that genuinely navigate. */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { variant = 'outline', size = 'md', className, children, ...rest },
  ref,
) {
  return (
    <a
      ref={ref}
      className={cx('ui-btn', className)}
      data-variant={variant}
      data-size={size === 'md' ? undefined : size}
      {...rest}
    >
      {children}
    </a>
  )
})

/** A plain text link at the system's underline weight. */
export const TextLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function TextLink({ className, children, ...rest }, ref) {
    return (
      <a ref={ref} className={cx('ui-link', className)} {...rest}>
        {children}
      </a>
    )
  },
)
