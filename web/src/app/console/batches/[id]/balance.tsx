import { Badge, Card, CardBody, CardHead, CardTitle } from '@/design'
import { fmtKg } from '../../bits'
import { RecordGas, SetFeedstockCarbon } from './balance-forms'

export type Balance = {
  code: string
  feedstock: { wetKg: number | null; moistureFrac: number | null; dryKg: number | null; carbonFrac: number | null; carbonSource: string | null }
  biochar: { dryKg: number | null; corgFrac: number | null }
  mass: null | {
    inputKg: number
    biocharKg: number
    otherBiocharKg: number
    liquidsKg: number
    gasKg: number
    gasMeasured: boolean
    closurePct: number | null
  }
  carbon: null | { inputKg: number; biocharKg: number; elsewhereKg: number; yieldPct: number }
  missing: string[]
  checks: { id: string; state: 'pass' | 'warn' | 'fail'; text: string }[]
}

const TONE = { pass: 'positive', warn: 'caution', fail: 'negative' } as const
const LABEL = { pass: 'Pass', warn: 'Check', fail: 'Fail' } as const

function Split({ parts, total, label }: { parts: { key: string; kg: number; name: string; open?: boolean }[]; total: number; label: string }) {
  return (
    <div className="split" role="img" aria-label={label}>
      <div className="split-bar">
        {parts
          .filter((p) => p.kg > 0)
          .map((p) => (
            <span
              key={p.key}
              className={`split-seg split-${p.key}${p.open ? ' split-open' : ''}`}
              style={{ width: `${(p.kg / total) * 100}%` }}
              title={`${p.name}: ${fmtKg(p.kg)}`}
            />
          ))}
      </div>
      <ul className="split-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`split-key split-${p.key}${p.open ? ' split-open' : ''}`} aria-hidden="true" />
            <span>{p.name}</span>
            <span className="num">{fmtKg(p.kg)}</span>
            <span className="muted num">{Math.round((p.kg / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BalanceCard({ b }: { b: Balance }) {
  const m = b.mass
  return (
    <Card data-testid="batch-balance">
      <CardHead>
        <CardTitle desc="Feedstock in, measured outputs out. Gas and water vapour are the remainder unless they were weighed.">
          Mass and carbon balance
        </CardTitle>
      </CardHead>
      <CardBody>
        <div className="transport">
          <section>
            <h3 className="transport-head">Mass, as received</h3>
            {m ? (
              <Split
                label="Mass balance"
                total={m.inputKg}
                parts={[
                  { key: 'char', kg: m.biocharKg, name: 'Biochar to the silo' },
                  { key: 'other', kg: m.otherBiocharKg, name: 'Biochar to other lines' },
                  { key: 'liquid', kg: m.liquidsKg, name: 'Bio-liquids' },
                  { key: 'gas', kg: Math.max(0, m.gasKg), name: m.gasMeasured ? 'Gas and vapour, weighed' : 'Gas and vapour, by difference', open: !m.gasMeasured },
                ]}
              />
            ) : (
              <p className="muted transport-sum">Needs the feedstock and biochar masses.</p>
            )}
            <p className="muted transport-sum" data-testid="balance-feedstock">
              {b.feedstock.wetKg !== null && `Feedstock ${fmtKg(b.feedstock.wetKg)}`}
              {b.feedstock.moistureFrac !== null && ` at ${Math.round(b.feedstock.moistureFrac * 100)}% moisture, ${fmtKg(b.feedstock.dryKg ?? 0)} dry`}
              .{' '}
              <RecordGas code={b.code} kg={m?.gasMeasured ? m.gasKg : null} />
            </p>
          </section>
          <section>
            <h3 className="transport-head">Carbon</h3>
            {b.carbon ? (
              <Split
                label="Carbon balance"
                total={b.carbon.inputKg}
                parts={[
                  { key: 'char', kg: b.carbon.biocharKg, name: 'In the biochar' },
                  { key: 'gas', kg: Math.max(0, b.carbon.elsewhereKg), name: 'In liquids and gas, by difference', open: true },
                ]}
              />
            ) : (
              <p className="muted transport-sum" data-testid="balance-carbon-missing">
                Needs {b.missing.filter((x) => x.includes('carbon')).join(' and ') || 'the feedstock and biochar masses'}.
              </p>
            )}
            <p className="muted transport-sum" data-testid="balance-carbon-source">
              {b.feedstock.carbonFrac !== null
                ? `Feedstock carbon ${Math.round(b.feedstock.carbonFrac * 1000) / 10}% of dry mass, from ${b.feedstock.carbonSource}. `
                : ''}
              <SetFeedstockCarbon
                code={b.code}
                pct={b.feedstock.carbonFrac === null ? null : Math.round(b.feedstock.carbonFrac * 1000) / 10}
                source={b.feedstock.carbonSource}
              />
            </p>
          </section>
        </div>
        {b.checks.length > 0 && (
          <ul className="balance-checks" aria-label="Balance checks">
            {b.checks.map((c) => (
              <li key={c.id} data-testid="balance-check" data-check={c.id} data-state={c.state}>
                <Badge tone={TONE[c.state]}>{LABEL[c.state]}</Badge>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
