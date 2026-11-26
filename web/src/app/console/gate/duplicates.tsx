'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/design'
import { oc } from '@/lib/client'

/** A person's call that a flagged pair is two real records. */
export function NotDuplicate({ kind, ids }: { kind: string; ids: string[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
      <Button
        variant="quiet"
        disabled={busy}
        data-testid="not-duplicate"
        onClick={async () => {
          setBusy(true)
          setError(null)
          const r = await oc('/duplicates/dismiss', { body: { kind, ids } })
          setBusy(false)
          if (!r.ok) return setError(r.error)
          router.refresh()
        }}
      >
        {busy ? 'Saving…' : 'Not a duplicate'}
      </Button>
      {error && <span style={{ color: 'var(--negative-ink)', fontSize: 'var(--t-ui-sm)' }}>{error}</span>}
    </span>
  )
}
