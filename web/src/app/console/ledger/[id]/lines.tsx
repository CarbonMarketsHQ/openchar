'use client'

import Link from 'next/link'
import { useState } from 'react'
import { IconChevronRight } from '@/design'
import type { LedgerBundle } from '@/lib/api'

/** The calculation, line by line, each one opening to its datapoints and
 * their evidence. This is the screen the whole system exists for. */
export function LedgerLines({ bundle }: { bundle: LedgerBundle }) {
  const [open, setOpen] = useState<number | null>(null)
  const dps = new Map(bundle.datapoints.map((d) => [d.id, d]))

  return (
    <div className="ledger-lines">
      {bundle.result.lines.map((line, i) => (
        <div className="ledger-line" key={i} data-open={open === i}>
          <button
            type="button"
            data-testid="ledger-line-toggle"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span>
              {line.label}
              {line.kind === 'counterfactual' && (
                <span className="muted" data-testid="ledger-counterfactual" style={{ display: 'block', fontSize: 'var(--t-caption)' }}>
                  {line.note}
                </span>
              )}
            </span>
            <span className="num">
              {line.value >= 0 ? '' : '−'}
              {Math.abs(line.value).toFixed(4)} {line.unit}
            </span>
            <span className="chev" aria-hidden="true">
              <IconChevronRight />
            </span>
          </button>
          {open === i && (
            <div className="detail">
              {line.note && line.kind !== 'counterfactual' && <p className="muted" style={{ margin: 0, fontSize: 'var(--t-caption)' }}>{line.note}</p>}
              {line.datapointIds.map((id) => {
                const d = dps.get(id)
                if (!d) return null
                return (
                  <div className="dp-row" key={id}>
                    <span className="mono muted">{d.id}</span>
                    <span>{d.label}</span>
                    <span className="num">
                      {d.value} {d.unit}
                      {d.sd ? ` ± ${d.sd}` : ''}
                    </span>
                    {d.sources.map((s) => (
                      <Link key={s.id} href={`/console/sources/${s.id}`} data-testid="evidence-link">
                        {s.kind}: {s.title}
                      </Link>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
