'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePortalSurface } from '../context'
import { IconX } from '../icons'
import type { Tone } from './badge'

/**
 * Transient confirmations. One region, announced politely, dismissible by
 * hand and by timer.
 *
 * A toast is the wrong place for anything the user must act on or must not
 * miss — that is a Notice next to the thing it concerns, or a Dialog. This is
 * for "saved", "copied", "queued".
 */

export type Toast = {
  id: number
  title: ReactNode
  description?: ReactNode
  tone?: Tone
  /** Milliseconds. Pass 0 to leave it until dismissed. */
  duration?: number
}

type ToastInput = Omit<Toast, 'id'>

const ToastContext = createContext<((t: ToastInput) => number) | null>(null)

export function useToast() {
  const push = useContext(ToastContext)
  if (!push) throw new Error('useToast() must be used inside <ToastProvider>')
  return push
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const [mounted, setMounted] = useState(false)
  const seq = useRef(0)
  const surface = usePortalSurface('ui-toasts')

  useEffect(() => setMounted(true), [])

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current
    setItems((list) => [...list, { ...t, id }])
    return id
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div {...surface} role="region" aria-label="Notifications">
            {items.map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const { id, duration = 4200 } = toast

  useEffect(() => {
    if (duration === 0) return
    const t = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(t)
  }, [id, duration, onDismiss])

  return (
    // assertive would interrupt a screen reader mid-sentence for a message
    // that, by definition, is not urgent
    <div className="ui-toast" data-tone={toast.tone} role="status" aria-live="polite">
      <div className="ui-toast__body">
        <div className="ui-toast__title">{toast.title}</div>
        {toast.description && <div className="ui-toast__desc">{toast.description}</div>}
      </div>
      <button
        type="button"
        className="ui-btn"
        data-variant="ghost"
        data-size="icon-sm"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss"
      >
        <IconX />
      </button>
    </div>
  )
}
