/**
 * The whole class-name helper. Falsy values drop out, the rest join.
 *
 * There is deliberately no clsx and no tailwind-merge here. Variants in this
 * system are data attributes resolved in CSS, so nothing ever needs to merge
 * or de-duplicate a class list, and the design system stays installable by
 * copying a folder.
 */
export type ClassValue = string | false | null | undefined

export function cx(...parts: ClassValue[]): string {
  let out = ''
  for (const p of parts) {
    if (!p) continue
    out = out ? `${out} ${p}` : p
  }
  return out
}
