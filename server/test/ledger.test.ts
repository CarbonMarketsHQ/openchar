/**
 * Ledger engine fixtures — charter section 1 (L1-L10).
 *
 * Expected values are hand-computed from the protocol text in
 * docs/research/isometric-protocol.md, independently of the implementation.
 * 44.01/12.01 = 3.6644463...; Woolf 200-yr params a=-0.383, b=0.350,
 * c=-0.048; T_soil floored at 7°C; F capped at 0.95.
 */
import { describe, expect, it } from 'vitest'
import {
  batchLedger,
  blend,
  counterfactualCC3,
  durability200,
  collectionDeduction,
  electricityDeduction,
  fuelDeduction,
  gates,
  requirementStates,
  storedCo2e,
  transportDeduction,
  type BatchInput,
} from '../src/ledger'

const dp = (id: string, value: number, unit: string, sd = 0, sourceIds: string[] = ['src-' + id]) => ({
  id,
  value,
  unit,
  sd,
  sourceIds,
})

const baseBatch = (): BatchInput => ({
  id: 'HT-02',
  wetMassKg: dp('wet', 1250, 'kg', 12.5),
  moistureFrac: dp('moist', 0.18, 'frac', 0.01),
  corgFrac: dp('corg', 0.78, 'frac', 0.02),
  hCorg: dp('hcorg', 0.42, 'molar'),
  oCorg: dp('ocorg', 0.12, 'molar'),
  tSoilC: dp('tsoil', 27.0, 'degC'),
})

describe('L1 stored CO2e', () => {
  it('computes dry mass, carbon and gross stored CO2e', () => {
    const r = storedCo2e(baseBatch())
    expect(r.dryMassT).toBeCloseTo(1.025, 9)
    expect(r.carbonT).toBeCloseTo(0.7995, 9)
    expect(r.grossT).toBeCloseTo(2.9297248, 5)
  })
})

describe('L2 durability (200-yr)', () => {
  it('matches the hand-computed Woolf value at 27°C, H/Corg 0.42', () => {
    const d = durability200(27.0, 0.42)
    expect(d.f).toBeCloseTo(0.7243720, 6)
    expect(d.capped).toBe(false)
    expect(d.tUsedC).toBe(27.0)
  })
  it('caps at 0.95', () => {
    const d = durability200(7.0, 0.05)
    expect(d.f).toBe(0.95)
    expect(d.capped).toBe(true)
  })
  it('floors soil temperature at 7°C', () => {
    const d = durability200(4.0, 0.42)
    expect(d.tUsedC).toBe(7.0)
    expect(d.f).toBeCloseTo(durability200(7.0, 0.42).f, 12)
  })
})

describe('L3 durability gates', () => {
  it('fails on H/Corg >= 0.5 with a named reason', () => {
    const g = gates(0.52, 0.1)
    expect(g.pass).toBe(false)
    expect(g.reasons.join(' ')).toMatch(/H\/Corg/)
  })
  it('fails on O/Corg >= 0.2', () => {
    const g = gates(0.3, 0.25)
    expect(g.pass).toBe(false)
    expect(g.reasons.join(' ')).toMatch(/O\/Corg/)
  })
  it('passes inside both gates', () => {
    expect(gates(0.42, 0.12).pass).toBe(true)
  })
  it('zeroes creditable tonnes for a gated batch', () => {
    const b = baseBatch()
    b.hCorg = dp('hcorg', 0.55, 'molar')
    const r = batchLedger(b, [], counterfactualCC3())
    expect(r.netConservativeT).toBe(0)
    expect(r.flags.join(' ')).toMatch(/gate/i)
  })
})

describe('L4 moisture plausibility', () => {
  it('rejects moisture outside [0, 0.5]', () => {
    const b = baseBatch()
    b.moistureFrac = dp('moist', 0.6, 'frac')
    expect(() => storedCo2e(b)).toThrow(/moisture/i)
  })
})

describe('L5 deductions', () => {
  it('transport: km × t × factor', () => {
    const d = transportDeduction(85, 2.1, 0.00011)
    expect(d.co2eT).toBeCloseTo(0.019635, 9)
  })
  it('feedstock collection: tonne-km × factor, on its own line', () => {
    const d = collectionDeduction(54.3, 0.00011)
    expect(d.co2eT).toBeCloseTo(0.005973, 6)
    expect(d.kind).toBe('collection')
    expect(d.label).toBe('Deduction: feedstock collection')
  })

  it('fuel: the logged tCO2e as its own line', () => {
    const d = fuelDeduction(0.134)
    expect(d.co2eT).toBe(0.134)
    expect(d.label).toBe('Deduction: fuel')
    expect(d.datapointIds).toEqual(['fuel-tco2e'])
  })

  it('electricity: kWh × factor', () => {
    const d = electricityDeduction(420, 0.000716)
    expect(d.co2eT).toBeCloseTo(0.30072, 9)
  })
  it('clamps net at zero with an explicit flag', () => {
    const b = baseBatch()
    const huge = transportDeduction(100000, 50, 0.00011)
    const r = batchLedger(b, [huge], counterfactualCC3())
    expect(r.netConservativeT).toBe(0)
    expect(r.netMeanT).toBe(0)
    expect(r.flags).toContain('NET_NEGATIVE')
  })
})

describe('L6 counterfactual carries its assumption', () => {
  it('CC3 decay is zero-valued but labelled, never silent', () => {
    const c = counterfactualCC3()
    expect(c.co2eT).toBe(0)
    expect(c.assumption).toMatch(/pending/i)
    const r = batchLedger(baseBatch(), [], c)
    const line = r.lines.find((l) => l.kind === 'counterfactual')
    expect(line).toBeDefined()
    expect(line!.note).toMatch(/pending/i)
  })
})

describe('L7 uncertainty', () => {
  it('reports a conservative figure at or below the mean', () => {
    const r = batchLedger(baseBatch(), [transportDeduction(85, 1.25, 0.00011)], counterfactualCC3())
    expect(r.netConservativeT).toBeLessThan(r.netMeanT)
    expect(r.sigmaT).toBeGreaterThan(0)
  })
  it('conservative equals mean when no input carries spread', () => {
    const b = baseBatch()
    b.wetMassKg = dp('wet', 1250, 'kg', 0)
    b.moistureFrac = dp('moist', 0.18, 'frac', 0)
    b.corgFrac = dp('corg', 0.78, 'frac', 0)
    const r = batchLedger(b, [], counterfactualCC3())
    expect(r.netConservativeT).toBeCloseTo(r.netMeanT, 9)
  })
})

describe('L8 blending', () => {
  it('adds stored CO2e and carbon-mass-weights H/Corg', () => {
    const r = blend([
      { dryMassT: 1.025, corgFrac: 0.78, hCorg: 0.42 },
      { dryMassT: 0.6, corgFrac: 0.7, hCorg: 0.48 },
    ])
    expect(r.grossT).toBeCloseTo(4.4687923, 5)
    expect(r.hCorg).toBeCloseTo(0.4406642, 6)
    expect(r.dryMassT).toBeCloseTo(1.625, 9)
  })
})

describe('L9 provenance', () => {
  it('every calculation line names the datapoints it consumed', () => {
    const r = batchLedger(baseBatch(), [transportDeduction(85, 1.25, 0.00011)], counterfactualCC3())
    expect(r.lines.length).toBeGreaterThan(3)
    for (const line of r.lines) expect(line.datapointIds.length).toBeGreaterThan(0)
  })
})

describe('L10 requirement states are computed, not hardcoded', () => {
  const REQUIRED = [
    'R-6YSW-0',
    'G-F74T-0',
    'G-2W0F-0',
    'R-ADXG-0',
    'G-KQSC-0',
    'G-7CN1-0',
    'G-1CDW-0',
    'R-TKNH-0',
    'G-6VWJ-0',
    'R-8W08-0',
  ]
  it('covers the charter requirement set', () => {
    const states = requirementStates({
      batches: [
        { id: 'HT-02', openedAt: daysAgo(20), closedAt: daysAgo(6), sampleCount: 3, hasTemperatureLog: true, hasDurationLog: true, hasGps: true },
      ],
      initialSampleCount: 9,
      methodBActive: false,
      moistureRegime: 'every-batch',
      stackTestDoneAt: null,
      stockpiles: [{ producedAt: daysAgo(30), appliedAt: null }],
      fieldSyncMaxLagDays: 2,
      hashChainIntact: true,
    })
    const ids = states.map((s) => s.id)
    for (const id of REQUIRED) expect(ids).toContain(id)
    const open = states.find((s) => s.id === 'R-TKNH-0')
    expect(open!.state).not.toBe('pass') // no stack test yet → warn or fail
    const batchWindow = states.find((s) => s.id === 'R-6YSW-0')
    expect(batchWindow!.state).toBe('pass') // 14-day batch inside 1 month
  })
  it('flags a batch that spans over a month', () => {
    const states = requirementStates({
      batches: [
        { id: 'X', openedAt: daysAgo(45), closedAt: daysAgo(2), sampleCount: 3, hasTemperatureLog: true, hasDurationLog: true, hasGps: true },
      ],
      initialSampleCount: 9,
      methodBActive: false,
      moistureRegime: 'every-batch',
      stackTestDoneAt: null,
      stockpiles: [],
      fieldSyncMaxLagDays: 2,
      hashChainIntact: true,
    })
    expect(states.find((s) => s.id === 'R-6YSW-0')!.state).toBe('fail')
  })
})

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString()
}
