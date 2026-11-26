import type React from 'react'
import Link from 'next/link'
import { Notice } from '@/design'
import { api, type Me } from '@/lib/api'

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty" data-testid="empty-state">
      <b>{title}</b>
      {children && <span>{children}</span>}
    </div>
  )
}

/** For data pages: a fresh workspace gets guidance, a dead API gets the
 * failure notice. */
export async function DataFallback() {
  const me = await api<Me>('/auth/me')
  if (me && me.projects.length === 0) {
    return (
      <div className="empty" data-testid="empty-state">
        <b>No project yet</b>
        <span>
          Create the first project to start recording batches and evidence.{' '}
          <Link href="/console/projects">Go to Projects</Link>
        </span>
      </div>
    )
  }
  return <ApiDown />
}

export function ApiDown() {
  return (
    <Notice tone="negative" title="The measurement API is unreachable">
      The console could not reach the data service. Check that the API container is running
      (docker compose ps) and reload this page.
    </Notice>
  )
}

export function Stat({
  label,
  value,
  dataValue,
  unit,
  detail,
  testId,
}: {
  label: string
  value: string
  dataValue?: number
  unit?: string
  detail?: React.ReactNode
  testId?: string
}) {
  return (
    <div className="stat">
      <span className="k" data-stamp>{label}</span>
      <span className="v" data-testid={testId} data-value={dataValue}>
        {value}
        {unit && <small> {unit}</small>}
      </span>
      {detail && <span className="d">{detail}</span>}
    </div>
  )
}

export function fmtDate(d: string | Date | null): string {
  if (!d) return 'open'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fmtKg(n: number | null): string {
  return n === null ? '–' : `${Math.round(n).toLocaleString('en-GB')} kg`
}
