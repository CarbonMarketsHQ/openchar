'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cx } from '../cx'
import { IconPanel } from '../icons'
import { Tooltip } from './tooltip'

/**
 * The application shell: a sidebar, and the page beside it.
 *
 * Three states, not two. Expanded and collapsed-to-rail are the desktop
 * states; off-canvas is what happens under 900px, where a 260px panel is an
 * obstruction rather than navigation. The component tracks which one it is in
 * and the stylesheet does the rest.
 *
 * Collapsing hides labels rather than clipping them — half a word is worse
 * than none — and every item keeps its name in a tooltip and in the
 * accessible name, so the rail is still navigable by screen reader and by
 * anyone who has not memorised the icons.
 */

type SidebarValue = {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  isMobile: boolean
}

const SidebarContext = createContext<SidebarValue | null>(null)

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar() must be used inside <SidebarProvider>')
  return ctx
}

const MOBILE = '(max-width: 900px)'

export function SidebarProvider({
  defaultOpen = true,
  open: controlled,
  onOpenChange,
  children,
}: {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const open = controlled ?? uncontrolled

  const setOpen = useCallback(
    (v: boolean) => {
      if (controlled === undefined) setUncontrolled(v)
      onOpenChange?.(v)
    },
    [controlled, onOpenChange],
  )

  // Matched here rather than in CSS alone because the toggle has to know which
  // state it is switching: on a phone it opens the drawer, on a desktop it
  // collapses to the rail.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE)
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const toggle = useCallback(() => {
    if (isMobile) setMobileOpen((v) => !v)
    else setOpen(!open)
  }, [isMobile, open, setOpen])

  // The shortcut every app with a sidebar has, so nobody has to reach.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggle()
      }
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle, mobileOpen, setMobileOpen, isMobile }}>
      <div className="ui-shell">{children}</div>
    </SidebarContext.Provider>
  )
}

export function Sidebar({ className, children }: { className?: string; children: ReactNode }) {
  const { open, mobileOpen, setMobileOpen, isMobile } = useSidebar()
  const stowed = isMobile && !mobileOpen
  const ref = useRef<HTMLElement>(null)

  // Set on the node rather than as a prop: React 18 does not know `inert` and
  // silently drops a boolean for an attribute it does not recognise, so the
  // stowed drawer stayed in the tab order. Setting the attribute works on
  // both React versions and needs no cast.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (stowed) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [stowed])

  return (
    <>
      {isMobile && mobileOpen && (
        <div className="ui-sidebar__scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      <nav
        ref={ref}
        className={cx('ui-sidebar', className)}
        data-state={open ? 'expanded' : 'collapsed'}
        data-mobile={isMobile ? (mobileOpen ? 'open' : 'closed') : undefined}
        // Off-canvas and closed is not just invisible, it is gone: leaving it
        // in the tab order is how keyboard users end up somewhere they cannot
        // see. inert takes the whole subtree out (above); aria-hidden covers
        // the browsers that have not shipped it.
        aria-hidden={stowed || undefined}
        aria-label="Main"
      >
        {children}
      </nav>
    </>
  )
}

export function SidebarHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('ui-sidebar__head', className)}>{children}</div>
}

export function SidebarBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('ui-sidebar__body', className)}>{children}</div>
}

export function SidebarFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('ui-sidebar__foot', className)}>{children}</div>
}

export function SidebarGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="ui-sidebar__group" role="group" aria-label={label}>
      {label && <span className="ui-sidebar__grouphead">{label}</span>}
      <div className="ui-sidebar__menu">{children}</div>
    </div>
  )
}

export function SidebarItem({
  icon,
  active,
  badge,
  asChild,
  onClick,
  href,
  children,
}: {
  icon?: ReactNode
  active?: boolean
  /** A count, at the right of the row. Hidden on the rail. */
  badge?: ReactNode
  asChild?: boolean
  onClick?: () => void
  href?: string
  children: string
}) {
  const { open, isMobile, setMobileOpen } = useSidebar()
  const railed = !open && !isMobile
  const Comp = asChild ? Slot : href ? 'a' : 'button'

  const item = (
    <Comp
      className="ui-sidebar__item"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      // On the rail the label is not rendered, so the row needs a name of its
      // own or it announces as an unlabelled button.
      aria-label={railed ? children : undefined}
      href={href}
      onClick={() => {
        onClick?.()
        // Navigating on a phone should put the drawer away; leaving it open
        // over the page you just asked for is the classic off-canvas bug.
        if (isMobile) setMobileOpen(false)
      }}
      {...(!asChild && !href ? { type: 'button' as const } : {})}
    >
      {icon && <span className="ui-sidebar__icon">{icon}</span>}
      <span className="ui-sidebar__label">{children}</span>
      {badge !== undefined && <span className="ui-sidebar__badge">{badge}</span>}
    </Comp>
  )

  return railed ? (
    <Tooltip label={children} side="bottom">
      {item}
    </Tooltip>
  ) : (
    item
  )
}

/** The workspace block at the top: a mark, a name, and what it is. */
export function SidebarBrand({
  mark,
  name,
  note,
  onClick,
  asChild,
}: {
  mark: ReactNode
  name: string
  note?: string
  onClick?: () => void
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp className="ui-sidebar__brand" onClick={onClick} {...(!asChild ? { type: 'button' as const } : {})}>
      <span className="ui-sidebar__mark">{mark}</span>
      <span className="ui-sidebar__brandtext ui-sidebar__only">
        <b>{name}</b>
        {note && <span>{note}</span>}
      </span>
    </Comp>
  )
}

/** The button that opens, collapses or closes it, depending where you are. */
export function SidebarTrigger({ className }: { className?: string }) {
  const { toggle, open, isMobile, mobileOpen } = useSidebar()
  const expanded = isMobile ? mobileOpen : open
  return (
    <button
      type="button"
      className={cx('ui-btn', className)}
      data-variant="ghost"
      data-size="icon-sm"
      onClick={toggle}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      <IconPanel />
    </button>
  )
}

/** Everything that is not the sidebar. */
export function SidebarInset({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('ui-inset', className)}>{children}</div>
}

export function Topbar({ className, children }: { className?: string; children: ReactNode }) {
  return <header className={cx('ui-topbar', className)}>{children}</header>
}

export function TopbarEnd({ children }: { children: ReactNode }) {
  return <div className="ui-topbar__end">{children}</div>
}

export function Breadcrumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav className="ui-crumbs" aria-label="Breadcrumb">
      {trail.map((c, i) => {
        const last = i === trail.length - 1
        return (
          <span key={c.label} style={{ display: 'contents' }}>
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.href && !last ? (
              <a href={c.href}>{c.label}</a>
            ) : (
              <span aria-current={last ? 'page' : undefined}>{c.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
