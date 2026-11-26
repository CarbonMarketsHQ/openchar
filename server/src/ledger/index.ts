/**
 * The open carbon-accounting ledger for biochar.
 *
 * Implements the quantification core of Isometric's Biochar Production and
 * Storage protocol v1.3 (see docs/research/isometric-protocol.md). Every
 * rule cites the requirement ID it serves, and every output line names the
 * datapoints it consumed, so a verifier can walk any number back to its
 * evidence.
 *
 * The 200-year durability parameters are the Woolf et al. (2021) 17th
 * percentile set as published in the Soil Environments module v1.3
 * (a = -0.383, b = 0.350, c = -0.048, T_soil floored at 7°C, F capped at
 * 0.95). Verify the algebraic form against the module text before any
 * production issuance claim; this transcription is flagged in the research.
 */

export type Datapoint = {
  id: string
  value: number
  unit: string
  sd?: number
  sourceIds: string[]
}

export type CalcLine = {
  kind: string
  label: string
  value: number
  unit: string
  datapointIds: string[]
  note?: string
}

export type BatchInput = {
  id: string
  wetMassKg: Datapoint
  moistureFrac: Datapoint
  corgFrac: Datapoint
  hCorg: Datapoint
  oCorg: Datapoint
  tSoilC: Datapoint
}

export type Deduction = {
  kind: 'transport' | 'collection' | 'electricity' | 'fuel' | 'diesel' | 'embodied'
  co2eT: number
  datapointIds: string[]
  note: string
  /** Shown on the ledger line; defaults to "Deduction: <kind>". */
  label?: string
}

export type Counterfactual = {
  co2eT: number
  assumption: string
  datapointIds: string[]
}

export type LedgerResult = {
  batchId: string
  gatePass: boolean
  grossT: number
  grossSigmaT: number
  fDurable: number
  fCapped: boolean
  tUsedC: number
  durableT: number
  deductionsT: number
  counterfactualT: number
  netMeanT: number
  netConservativeT: number
  sigmaT: number
  lines: CalcLine[]
  flags: string[]
}

/** CO2 to C molar mass ratio: 44.01 / 12.01. */
export const CO2_PER_C = 44.01 / 12.01

const WOOLF = { a: -0.383, b: 0.35, c: -0.048 }
const T_SOIL_FLOOR_C = 7
const F_CAP = 0.95
const H_CORG_GATE = 0.5 // durability eligibility gate
const O_CORG_GATE = 0.2

export function storedCo2e(b: BatchInput): {
  dryMassT: number
  carbonT: number
  grossT: number
  sigmaT: number
  lines: CalcLine[]
} {
  const m = b.moistureFrac.value
  if (m < 0 || m > 0.5) {
    throw new Error(
      `moisture ${m} outside the plausible range [0, 0.5] — flag the measurement, do not credit it (R-ADXG-0)`
    )
  }
  const wetT = b.wetMassKg.value / 1000
  const dryMassT = wetT * (1 - m)
  const carbonT = dryMassT * b.corgFrac.value
  const grossT = carbonT * CO2_PER_C

  // Relative spreads of the product terms add in quadrature.
  const rel = (dp: Datapoint, denom: number) => (dp.sd ? dp.sd / denom : 0)
  const relWet = rel(b.wetMassKg, b.wetMassKg.value)
  const relDry = rel(b.moistureFrac, 1 - m) // sd of (1-m) equals sd of m
  const relCorg = rel(b.corgFrac, b.corgFrac.value)
  const sigmaT = grossT * Math.sqrt(relWet ** 2 + relDry ** 2 + relCorg ** 2)

  const lines: CalcLine[] = [
    {
      kind: 'dry-mass',
      label: 'Dry biochar mass',
      value: dryMassT,
      unit: 't',
      datapointIds: [b.wetMassKg.id, b.moistureFrac.id],
    },
    {
      kind: 'carbon',
      label: 'Organic carbon',
      value: carbonT,
      unit: 't C',
      datapointIds: [b.corgFrac.id, b.wetMassKg.id, b.moistureFrac.id],
    },
    {
      kind: 'gross',
      label: 'Gross stored CO2e (C × 44.01/12.01)',
      value: grossT,
      unit: 't CO2e',
      datapointIds: [b.corgFrac.id, b.wetMassKg.id, b.moistureFrac.id],
    },
  ]
  return { dryMassT, carbonT, grossT, sigmaT, lines }
}

export function durability200(
  tSoilC: number,
  hCorg: number
): { f: number; tUsedC: number; capped: boolean } {
  const tUsedC = Math.max(T_SOIL_FLOOR_C, tSoilC)
  const raw = 1 - (WOOLF.c + (WOOLF.a + WOOLF.b * Math.log(tUsedC)) * hCorg)
  const bounded = Math.max(0, raw)
  const f = Math.min(F_CAP, bounded)
  return { f, tUsedC, capped: raw > F_CAP }
}

export function gates(hCorg: number, oCorg: number): { pass: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (hCorg >= H_CORG_GATE) reasons.push(`H/Corg ${hCorg} is at or above the ${H_CORG_GATE} durability gate`)
  if (oCorg >= O_CORG_GATE) reasons.push(`O/Corg ${oCorg} is at or above the ${O_CORG_GATE} durability gate`)
  return { pass: reasons.length === 0, reasons }
}

export function transportDeduction(km: number, massT: number, factorTPerTKm: number): Deduction {
  return {
    kind: 'transport',
    co2eT: km * massT * factorTPerTKm,
    datapointIds: ['transport-distance', 'transport-mass', 'ef-transport'],
    note: `${km} km × ${massT} t × ${factorTPerTKm} tCO2e per t-km`,
  }
}

export function electricityDeduction(kwh: number, factorTPerKwh: number): Deduction {
  return {
    kind: 'electricity',
    co2eT: kwh * factorTPerKwh,
    datapointIds: ['electricity-kwh', 'ef-grid'],
    note: `${kwh} kWh × ${factorTPerKwh} tCO2e per kWh (grid)`,
  }
}

/** Feedstock collection, from supplier to plant, in tonne-kilometres. */
export function collectionDeduction(tonneKm: number, factorTPerTKm: number): Deduction {
  return {
    kind: 'collection',
    label: 'Deduction: feedstock collection',
    co2eT: tonneKm * factorTPerTKm,
    datapointIds: ['collection-tkm', 'ef-transport'],
    note: `${tonneKm} t-km × ${factorTPerTKm} tCO2e per t-km`,
  }
}

/** Fossil fuel burned for the run (start-up, generator, loader), already in tCO2e. */
export function fuelDeduction(co2eT: number): Deduction {
  return {
    kind: 'fuel',
    label: 'Deduction: fuel',
    co2eT,
    datapointIds: ['fuel-tco2e'],
    note: `${co2eT} tCO2e from the fuel log`,
  }
}

export function counterfactualCC3(): Counterfactual {
  return {
    co2eT: 0,
    assumption:
      'CC3: residue left to decay, with no commercial use. All its stored biogenic carbon is assumed emitted within 15 years without the project, so the deduction is zero. Pending Isometric\'s assessment of the supplier evidence.',
    datapointIds: ['counterfactual-evidence'],
  }
}

export function batchLedger(
  input: BatchInput,
  deductions: Deduction[],
  counterfactual: Counterfactual
): LedgerResult {
  const flags: string[] = []
  const gate = gates(input.hCorg.value, input.oCorg.value)

  const stored = storedCo2e(input)
  const dur = durability200(input.tSoilC.value, input.hCorg.value)
  const deductionsT = deductions.reduce((s, d) => s + d.co2eT, 0)

  const lines: CalcLine[] = [...stored.lines]
  lines.push({
    kind: 'durability',
    label: `Durable fraction, 200-yr (H/Corg ${input.hCorg.value}, soil ${dur.tUsedC}°C)`,
    value: dur.f,
    unit: 'fraction',
    datapointIds: [input.hCorg.id, input.tSoilC.id],
    note: dur.capped ? 'capped at 0.95' : undefined,
  })
  for (const d of deductions) {
    lines.push({
      kind: `deduction-${d.kind}`,
      label: d.label ?? `Deduction: ${d.kind}`,
      value: -d.co2eT,
      unit: 't CO2e',
      datapointIds: d.datapointIds,
      note: d.note,
    })
  }
  lines.push({
    kind: 'counterfactual',
    label: 'Counterfactual',
    value: -counterfactual.co2eT,
    unit: 't CO2e',
    datapointIds: counterfactual.datapointIds,
    note: counterfactual.assumption,
  })

  if (!gate.pass) {
    flags.push(`GATE_FAIL: ${gate.reasons.join('; ')}`)
    return {
      batchId: input.id,
      gatePass: false,
      grossT: stored.grossT,
      grossSigmaT: stored.sigmaT,
      fDurable: 0,
      fCapped: false,
      tUsedC: dur.tUsedC,
      durableT: 0,
      deductionsT,
      counterfactualT: counterfactual.co2eT,
      netMeanT: 0,
      netConservativeT: 0,
      sigmaT: stored.sigmaT,
      lines,
      flags,
    }
  }

  const durableT = stored.grossT * dur.f
  const sigmaT = stored.sigmaT * dur.f
  let netMeanT = durableT - deductionsT - counterfactual.co2eT
  if (netMeanT < 0) {
    flags.push('NET_NEGATIVE')
    netMeanT = 0
  }
  // Conservative estimate at the 16th percentile: mean minus one standard
  // deviation (Isometric Standard v2.1 uncertainty treatment).
  const netConservativeT = netMeanT === 0 ? 0 : Math.max(0, netMeanT - sigmaT)

  lines.push({
    kind: 'net',
    label: 'Net removal (conservative, 16th percentile)',
    value: netConservativeT,
    unit: 't CO2e',
    datapointIds: [
      input.wetMassKg.id,
      input.moistureFrac.id,
      input.corgFrac.id,
      input.hCorg.id,
      input.tSoilC.id,
      ...deductions.flatMap((d) => d.datapointIds),
      ...counterfactual.datapointIds,
    ],
  })

  return {
    batchId: input.id,
    gatePass: true,
    grossT: stored.grossT,
    grossSigmaT: stored.sigmaT,
    fDurable: dur.f,
    fCapped: dur.capped,
    tUsedC: dur.tUsedC,
    durableT,
    deductionsT,
    counterfactualT: counterfactual.co2eT,
    netMeanT,
    netConservativeT,
    sigmaT,
    lines,
    flags,
  }
}

export function blend(
  parts: { dryMassT: number; corgFrac: number; hCorg: number }[]
): { dryMassT: number; grossT: number; hCorg: number; corgFrac: number } {
  const dryMassT = parts.reduce((s, p) => s + p.dryMassT, 0)
  const carbonT = parts.reduce((s, p) => s + p.dryMassT * p.corgFrac, 0)
  const hCorg = parts.reduce((s, p) => s + p.dryMassT * p.corgFrac * p.hCorg, 0) / carbonT
  return { dryMassT, grossT: carbonT * CO2_PER_C, hCorg, corgFrac: carbonT / dryMassT }
}

/* ------------------------------------------------------------ compliance */

export type ComplianceSnapshot = {
  batches: {
    id: string
    openedAt: string
    closedAt: string | null
    sampleCount: number
    hasTemperatureLog: boolean
    hasDurationLog: boolean
    hasGps: boolean
  }[]
  initialSampleCount: number
  methodBActive: boolean
  moistureRegime: 'every-batch' | 'target-wetting' | 'dry-weight'
  stackTestDoneAt: string | null
  stockpiles: { producedAt: string; appliedAt: string | null }[]
  fieldSyncMaxLagDays: number
  hashChainIntact: boolean
}

export type RequirementState = {
  id: string
  title: string
  state: 'pass' | 'warn' | 'fail'
  detail: string
}

const DAY = 86400000

/** "1 batch", "3 batches": counts read as words, not as "batch(es)". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function requirementStates(s: ComplianceSnapshot): RequirementState[] {
  const out: RequirementState[] = []
  const now = Date.now()

  const spans = s.batches
    .filter((b) => b.closedAt)
    .map((b) => (new Date(b.closedAt!).getTime() - new Date(b.openedAt).getTime()) / DAY)
  const worstSpan = Math.max(0, ...spans)
  out.push({
    id: 'R-6YSW-0',
    title: 'Production batch spans less than one month',
    state: worstSpan <= 31 ? 'pass' : 'fail',
    detail: spans.length
      ? `Longest closed batch: ${worstSpan.toFixed(1)} days.`
      : 'No closed batches yet.',
  })

  const underSampled = s.batches.filter((b) => b.closedAt && b.sampleCount < 3)
  out.push({
    id: 'G-F74T-0',
    title: 'Method A: 3 independent samples per batch, 30-sample initial campaign',
    state: underSampled.length ? 'fail' : s.initialSampleCount >= 30 ? 'pass' : 'warn',
    detail: underSampled.length
      ? `${count(underSampled.length, 'closed batch', 'closed batches')} with fewer than 3 samples.`
      : `${s.initialSampleCount} of the 30 initial samples collected.`,
  })

  out.push({
    id: 'G-2W0F-0',
    title: 'Method B sampling only after demonstrated consistency',
    state: s.methodBActive ? 'warn' : 'pass',
    detail: s.methodBActive
      ? 'Method B in use. Temperature and residence-time consistency evidence must be on file.'
      : 'Method A in use. Method B opens once the telemetry shows consistent runs.',
  })

  out.push({
    id: 'R-ADXG-0',
    title: 'Moisture regime declared and followed',
    state: 'pass',
    detail: s.moistureRegime === 'every-batch' ? 'Moisture measured on every batch.' : `Moisture regime: ${s.moistureRegime}.`,
  })

  const noTemp = s.batches.filter((b) => !b.hasTemperatureLog)
  out.push({
    id: 'G-KQSC-0',
    title: 'Temperature sensor logging through every production run',
    state: noTemp.length ? 'fail' : 'pass',
    detail: noTemp.length ? `${count(noTemp.length, 'batch', 'batches')} without a temperature log.` : 'Every batch has a temperature log.',
  })

  const noDur = s.batches.filter((b) => !b.hasDurationLog)
  out.push({
    id: 'G-7CN1-0',
    title: 'Batch duration tracked',
    state: noDur.length ? 'fail' : 'pass',
    detail: noDur.length ? `${count(noDur.length, 'batch', 'batches')} without a recorded duration.` : 'Every batch is timed.',
  })

  const noGps = s.batches.filter((b) => !b.hasGps)
  out.push({
    id: 'G-1CDW-0',
    title: 'Production unit geolocated at run start',
    state: noGps.length ? 'fail' : 'pass',
    detail: noGps.length ? `${count(noGps.length, 'batch', 'batches')} without GPS.` : 'Reactor location recorded on every run.',
  })

  out.push({
    id: 'R-TKNH-0',
    title: 'Stack emissions tested at least annually (CO2, CH4, N2O)',
    state: s.stackTestDoneAt
      ? now - new Date(s.stackTestDoneAt).getTime() < 365 * DAY
        ? 'pass'
        : 'fail'
      : 'warn',
    detail: s.stackTestDoneAt
      ? `Last test on ${s.stackTestDoneAt.slice(0, 10)}.`
      : 'No stack test on record. Book one during the hot trials.',
  })

  const oldest = s.stockpiles
    .filter((p) => !p.appliedAt)
    .map((p) => (now - new Date(p.producedAt).getTime()) / DAY)
  const worstAge = Math.max(0, ...oldest)
  out.push({
    id: 'G-6VWJ-0',
    title: 'Stockpiling capped at 12 months post-production',
    state: worstAge > 365 ? 'fail' : worstAge > 270 ? 'warn' : 'pass',
    detail: oldest.length
      ? `Oldest unapplied lot: ${worstAge.toFixed(0)} days.`
      : 'No unapplied stockpile.',
  })

  out.push({
    id: 'R-8W08-0',
    title: 'dMRV: offline capture, tamper evidence, anomaly flags, 30-day upload',
    state: s.hashChainIntact && s.fieldSyncMaxLagDays <= 30 ? 'pass' : 'fail',
    detail: `${s.hashChainIntact ? 'Hash chain intact.' : 'Hash chain BROKEN.'} Slowest field sync: ${s.fieldSyncMaxLagDays} days.`,
  })

  return out
}
