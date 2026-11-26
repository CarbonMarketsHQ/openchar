/** Route settings the edge proxy reads. Kept apart from ./index.tsx so the
 * proxy never bundles page code. */

/** Paths that open without a session, beyond the core sign-in pages (for
 * example an extension's own sign-up page and its API route). */
export const extraPublicPaths: string[] = []

/** True when ./index.tsx provides a landing page for `/`. */
export const hasHome = false
