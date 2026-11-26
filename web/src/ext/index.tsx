import type { ReactNode } from 'react'

/**
 * Extension slots for builds that add pages on top of the open core (the
 * hosted service adds a usage page this way). A self-hosted build leaves
 * them empty. Keep this file small: a fork that fills a slot edits only it.
 */
export type NavItem = { href: string; label: string; icon: ReactNode }

/** Extra entries for the console sidebar's setup group. */
export const extraSetupNav: NavItem[] = []

/** A landing page for `/`. Without one, `/` goes straight to the console.
 * A build that sets it also sets `hasHome` in ./routes.ts. */
export const Home: (() => ReactNode | Promise<ReactNode>) | null = null
