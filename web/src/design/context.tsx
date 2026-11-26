'use client'

/**
 * The root, and the one piece of plumbing the system needs.
 *
 * Dialogs, select menus, tooltips and toasts all render through a portal at
 * the end of <body>, which puts them outside whatever element carries .cmhq.
 * Tokens are scoped to .cmhq, so a portalled panel would otherwise come out
 * unstyled — transparent background, wrong ink, no font.
 *
 * The fix is to make every portalled surface a .cmhq root in its own right
 * and hand it the current mode. usePortalSurface() returns exactly the props
 * that does, and every portalling component in this system spreads it.
 */

import { createContext, useContext, useMemo } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type Theme = 'field' | 'paper' | 'ink'

type SystemValue = {
  theme: Theme
  /** The mode the portalled surfaces should take. Undefined means inherit. */
  dataTheme: 'paper' | 'ink' | undefined
}

/** Field is the default, so it is expressed as the absence of an override. */
const themeAttr = (t: Theme) => (t === 'field' ? undefined : t)

const SystemContext = createContext<SystemValue>({ theme: 'field', dataTheme: undefined })

export function SystemProvider({ theme = 'field', children }: { theme?: Theme; children: ReactNode }) {
  const value = useMemo(() => ({ theme, dataTheme: themeAttr(theme) }), [theme])
  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>
}

export function useSystemTheme() {
  return useContext(SystemContext).theme
}

/**
 * Spread onto any element rendered through a portal.
 *
 *   <Dialog.Content {...usePortalSurface('ui-dialog')}>
 */
export function usePortalSurface(...classes: (string | false | undefined)[]) {
  const { dataTheme } = useContext(SystemContext)
  return { className: cx('cmhq', ...classes), 'data-theme': dataTheme }
}

type InstrumentProps = HTMLAttributes<HTMLDivElement> & {
  theme?: Theme
  children: ReactNode
}

/**
 * A design-system root as an element, for embedding the system inside a page
 * it does not own — a widget in the dashboard, a panel in someone else's app.
 *
 * When the system owns the whole document instead, put className="cmhq" on
 * <body> and wrap the tree in SystemProvider; this component is not needed.
 */
export function Instrument({ theme = 'field', className, children, ...rest }: InstrumentProps) {
  return (
    <SystemProvider theme={theme}>
      <div className={cx('cmhq', className)} data-theme={themeAttr(theme)} {...rest}>
        {children}
      </div>
    </SystemProvider>
  )
}
