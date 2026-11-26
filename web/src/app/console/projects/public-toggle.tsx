'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/design'
import { oc } from '@/lib/client'

/** Publishing is the owner's choice, per project. Off by default: nothing
 * about a project is visible outside the workspace until an admin turns
 * its public page on, and turning it off takes the page down at once. */
export function PublicToggle({ projectId, isPublic }: { projectId: string; isPublic: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="public-toggle">
      {isPublic ? (
        <a href={`/public/${projectId}`} target="_blank" rel="noreferrer" data-testid="public-link">
          Public page is on
        </a>
      ) : (
        <span className="muted">Public page is off</span>
      )}
      <Button
        variant="ghost"
        disabled={busy}
        data-testid="public-toggle"
        onClick={async () => {
          setBusy(true)
          setError(null)
          const r = await oc(`/projects/${projectId}`, { method: 'PATCH', body: { public: !isPublic } })
          setBusy(false)
          if (!r.ok) return setError(r.status === 403 ? 'Only an admin can change this.' : r.error)
          router.refresh()
        }}
      >
        {isPublic ? 'Unpublish' : 'Publish'}
      </Button>
      {error && <span style={{ color: "var(--negative-ink)" }}>{error}</span>}
    </div>
  )
}
