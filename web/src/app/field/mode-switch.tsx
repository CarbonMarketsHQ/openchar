import Link from 'next/link'

/** The two jobs of the field app: capture at the gate, and record where biochar went into the soil. */
export function ModeSwitch({ mode }: { mode: 'gate' | 'apply' }) {
  return (
    <nav className="field-modes" aria-label="Field app mode">
      <Link href="/field" aria-current={mode === 'gate' ? 'page' : undefined} data-testid="mode-gate">
        Gate capture
      </Link>
      <Link href="/field/apply" aria-current={mode === 'apply' ? 'page' : undefined} data-testid="mode-apply">
        Soil application
      </Link>
    </nav>
  )
}
