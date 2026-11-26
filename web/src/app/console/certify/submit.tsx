'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/design'
import { oc } from '@/lib/client'

export function SubmitStatement({ batchId }: { batchId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-2)', justifyItems: 'start' }}>
      <Button
        variant="solid"
        data-testid="certify-submit"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          const res = await oc(`/certify/submit/${batchId}`, { method: 'POST', body: {} })
          setBusy(false)
          if (!res.ok) {
            setError(res.error ?? 'The submission did not go through.')
            return
          }
          router.refresh()
        }}
      >
        {busy ? 'Submitting…' : `Submit ${batchId} statement (mock)`}
      </Button>
      {error && <span style={{ color: 'var(--negative-ink)', fontSize: 'var(--t-ui-sm)' }}>{error}</span>}
    </div>
  )
}
