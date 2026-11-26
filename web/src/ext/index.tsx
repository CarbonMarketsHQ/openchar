import type { ReactNode } from 'react'

/**
 * Extension slots for builds that add pages on top of the open core (the
 * hosted service adds a usage page this way). A self-hosted build leaves
 * them empty. Keep this file small: a fork that fills a slot edits only it.
 */
export type NavItem = { href: string; label: string; icon: ReactNode }

/** Extra entries for the console sidebar's setup group. */
export const extraSetupNav: NavItem[] = []
