'use client'

import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePortalSurface } from '../context'

type Side = 'top' | 'bottom'

/**
 * A tooltip for the label an icon button cannot carry.
 *
 * Rules it keeps, because tooltips are the control that most often fails
 * quietly: it opens on focus as well as hover, it closes on Escape, it is
 * never the only place the name exists (the trigger keeps its own
 * aria-label), and it holds no interactive content — anything clickable in a
 * hover panel is unreachable by touch and by keyboard alike.
 */
export function Tooltip({
  label,
  side = 'top',
  delay = 260,
  children,
}: {
  label: ReactNode
  side?: Side
  delay?: number
  children: ReactElement
}) {
  const id = useId()
  const [pos, setPos] = useState<{ top: number; left: number; side: Side } | null>(null)
  const ref = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const surface = usePortalSurface('ui-tip')

  const close = useCallback(() => {
    clearTimeout(timer.current)
    setPos(null)
  }, [])

  const place = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Flip to the other side rather than clipping when there is no room.
    const room = side === 'top' ? r.top : window.innerHeight - r.bottom
    const resolved: Side = room < 56 ? (side === 'top' ? 'bottom' : 'top') : side
    setPos({
      top: resolved === 'top' ? r.top - 8 : r.bottom + 8,
      left: r.left + r.width / 2,
      side: resolved,
    })
  }, [side])

  const open = useCallback(
    (immediate: boolean) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(place, immediate ? 0 : delay)
    },
    [delay, place],
  )

  useEffect(() => {
    if (!pos) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
    }
  }, [pos, close])

  useEffect(() => () => clearTimeout(timer.current), [])

  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    ref: (node: HTMLElement) => {
      ref.current = node
      const r = (children as unknown as { ref?: unknown }).ref
      if (typeof r === 'function') r(node)
      else if (r && typeof r === 'object') (r as { current: unknown }).current = node
    },
    'aria-describedby': pos ? id : undefined,
    onMouseEnter: () => open(false),
    onMouseLeave: close,
    onFocus: () => open(true),
    onBlur: close,
  })

  return (
    <>
      {trigger}
      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            {...surface}
            id={id}
            role="tooltip"
            style={{
              top: pos.top,
              left: pos.left,
              transform: `translate(-50%, ${pos.side === 'top' ? '-100%' : '0'})`,
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  )
}
