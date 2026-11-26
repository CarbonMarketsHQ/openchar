'use client'

import { createContext, useContext, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cx } from '../cx'

/**
 * Tabs, to the WAI-ARIA pattern: one stop in the tab order for the whole
 * list, arrow keys to move between tabs, Home and End to the ends. Anything
 * less turns a five-tab group into five tab stops, which is how keyboard
 * users end up trapped in a nav bar.
 *
 * Activation follows selection, which is right when panels are already in the
 * document. If a panel ever loads over the network, switch to manual
 * activation so arrowing past a tab does not fire a request.
 */

type TabsValue = {
  value: string
  setValue: (v: string) => void
  base: string
}

const TabsContext = createContext<TabsValue | null>(null)

function useTabs(who: string) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error(`<${who}> must be used inside <Tabs>`)
  return ctx
}

export function Tabs({
  defaultValue,
  value: controlled,
  onValueChange,
  className,
  children,
}: {
  defaultValue: string
  value?: string
  onValueChange?: (v: string) => void
  className?: string
  children: ReactNode
}) {
  const base = useId()
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const value = controlled ?? uncontrolled

  const setValue = (v: string) => {
    if (controlled === undefined) setUncontrolled(v)
    onValueChange?.(v)
  }

  return (
    <TabsContext.Provider value={{ value, setValue, base }}>
      <div className={cx('ui-tabs', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabList({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key)) return

    const tabs = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    if (tabs.length === 0) return

    const i = tabs.findIndex((t) => t === document.activeElement)
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? tabs.length - 1
          : // wraps, so the list has no dead end in either direction
            (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length

    e.preventDefault()
    tabs[next]?.focus()
    tabs[next]?.click()
  }

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      className={cx('ui-tabs__list', className)}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
}

export function Tab({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  const { value: active, setValue, base } = useTabs('Tab')
  const selected = active === value

  return (
    <button
      type="button"
      role="tab"
      id={`${base}-tab-${value}`}
      aria-controls={`${base}-panel-${value}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={cx('ui-tabs__trigger', className)}
      onClick={() => setValue(value)}
    >
      {children}
    </button>
  )
}

export function TabPanel({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  const { value: active, base } = useTabs('TabPanel')
  if (active !== value) return null

  return (
    <div
      role="tabpanel"
      id={`${base}-panel-${value}`}
      aria-labelledby={`${base}-tab-${value}`}
      tabIndex={0}
      className={cx('ui-tabs__panel', className)}
    >
      {children}
    </div>
  )
}
