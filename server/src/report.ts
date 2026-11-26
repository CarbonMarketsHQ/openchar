/**
 * Builders that turn database rows into ledger inputs, compliance
 * snapshots and Certify-shaped payloads. Everything is project-scoped and
 * data-driven: no client-specific text lives in code.
 */
import { pool, verifyChain } from './db.js'
import {
  batchLedger,
  counterfactualCC3,
  electricityDeduction,
  requirementStates,
  transportDeduction,
  type BatchInput,
  type ComplianceSnapshot,
  type Datapoint,
  type LedgerResult,
  type RequirementState,
} from './ledger/index.js'

/** Default emission factors, each with its provenance. A project sets its
 * own grid factor (the country's grid differs most from place to place);
 * both defaults are to be replaced from Isometric's GHG Accounting and
 * Energy Use modules before issuance. */
export const FACTORS = {
  transportTPerTKm: {
    value: 0.00011,
    note: 'Road freight, heavy goods vehicle average (to be replaced by the GHG Accounting Module value)',
  },
  gridTPerKwh: {
    value: 0.000716,
    note: 'No grid factor set for this project, so an illustrative 0.716 kg CO2e per kWh is used. Set your national grid factor on the Projects page.',
  },
}

export type LedgerBundle = {
  result: LedgerResult
  datapoints: (Datapoint & { label: string; sources: { id: string; title: string; kind: string }[] })[]
  assumptions: string[]
}

export async function resolveBatch(projectId: string, code: string) {
  const { rows } = await pool.query(`SELECT * FROM batches WHERE project_id = $1 AND code = $2`, [
    projectId,
    code,
  ])
  return rows[0] ?? null
}

async function projectSource(projectId: string, kind: string) {
  const { rows } = await pool.query(
    `SELECT id, title, kind FROM sources WHERE project_id = $1 AND kind = $2 ORDER BY created_at LIMIT 1`,
    [projectId, kind]
  )
  return rows[0] ?? null
}

export async function buildLedger(projectId: string, code: string): Promise<LedgerBundle | null> {
  const b = (
    await pool.query(
      `SELECT b.*, c.corg_frac, c.h_corg, c.o_corg, c.source_id AS cert_source,
              p.t_soil_c, p.t_soil_source, p.grid_ef_t_per_kwh, p.grid_ef_source
       FROM batches b
       LEFT JOIN certificates c ON c.batch_id = b.id
       JOIN projects p ON p.id = b.project_id
       WHERE b.project_id = $1 AND b.code = $2`,
      [projectId, code]
    )
  ).rows[0]
  if (!b || b.corg_frac === null || b.biochar_wet_kg === null) return null

  const ops = (await pool.query(`SELECT * FROM batch_ops WHERE batch_id = $1`, [b.id])).rows[0]
  const grid =
    b.grid_ef_t_per_kwh === null
      ? FACTORS.gridTPerKwh
      : { value: Number(b.grid_ef_t_per_kwh), note: `Grid emission factor: ${b.grid_ef_source ?? 'source not recorded'}` }
  const calibration = await projectSource(projectId, 'calibration')
  const counterfactualEvidence = await projectSource(projectId, 'counterfactual')
  const slip = await projectSource(projectId, 'weighbridge-slip')
  const certSource = b.cert_source
    ? (await pool.query(`SELECT id, title, kind FROM sources WHERE id = $1`, [b.cert_source])).rows[0]
    : null

  const dps: LedgerBundle['datapoints'] = []
  const dp = (
    id: string,
    label: string,
    value: number,
    unit: string,
    sd: number,
    sources: { id: string; title: string; kind: string }[]
  ): Datapoint => {
    const sourceIds = sources.map((s) => s.id)
    dps.push({ id, label, value, unit, sd, sourceIds: sourceIds.length ? sourceIds : [id], sources })
    return { id, value, unit, sd, sourceIds: sourceIds.length ? sourceIds : [id] }
  }

  const calSources = calibration ? [calibration] : []
  const certSources = certSource ? [certSource] : []
  const profileSource = { id: 'project-profile', title: b.t_soil_source, kind: 'reference' }

  const input: BatchInput = {
    id: b.code,
    wetMassKg: dp('wet-mass', 'Biochar wet mass (silo scale)', Number(b.biochar_wet_kg), 'kg', Number(b.biochar_wet_kg) * 0.01, calSources),
    moistureFrac: dp('moisture', 'Biochar moisture at discharge', Number(b.biochar_moisture_frac), 'fraction', 0.01, certSources),
    corgFrac: dp('corg', 'Organic carbon fraction (lab)', Number(b.corg_frac), 'fraction of dry mass', 0.02, certSources),
    hCorg: dp('hcorg', 'H/Corg molar ratio (lab)', Number(b.h_corg), 'molar', 0, certSources),
    oCorg: dp('ocorg', 'O/Corg molar ratio (lab)', Number(b.o_corg), 'molar', 0, certSources),
    tSoilC: dp('tsoil', 'Soil temperature at storage sites', Number(b.t_soil_c), 'degC', 0, [profileSource]),
  }

  const deductions = []
  if (ops) {
    const slipSources = slip ? [slip] : []
    dp('transport-distance', 'Feedstock transport distance', Number(ops.transport_km), 'km', 0, slipSources)
    dp('transport-mass', 'Transported mass', Number(ops.transport_mass_t), 't', 0, slipSources)
    dp('ef-transport', FACTORS.transportTPerTKm.note, FACTORS.transportTPerTKm.value, 'tCO2e/t-km', 0, [])
    dp('electricity-kwh', 'Plant electricity for the run', Number(ops.electricity_kwh), 'kWh', 0, [])
    dp('ef-grid', grid.note, grid.value, 'tCO2e/kWh', 0, [])
    deductions.push(
      transportDeduction(Number(ops.transport_km), Number(ops.transport_mass_t), FACTORS.transportTPerTKm.value),
      electricityDeduction(Number(ops.electricity_kwh), grid.value)
    )
  }
  const cf = counterfactualCC3()
  dp(
    'counterfactual-evidence',
    counterfactualEvidence?.title ?? 'Counterfactual evidence (pending collection)',
    0,
    'tCO2e',
    0,
    counterfactualEvidence ? [counterfactualEvidence] : []
  )

  const result = batchLedger(input, deductions, cf)
  return {
    result,
    datapoints: dps,
    assumptions: [
      cf.assumption,
      FACTORS.transportTPerTKm.note,
      grid.note,
      'Durability equation transcribed from the Soil Environments module v1.3. Verify the algebraic form with Isometric before claiming issuance.',
    ],
  }
}

export type Anomaly = { kind: string; fromMinute: number; toMinute: number; minTempC: number }

export function findAnomalies(points: { minute: number; tempC: number }[]): Anomaly[] {
  const HOT = 450
  const FLOOR = 400
  const hotIdx = points.filter((p) => p.tempC >= HOT).map((p) => p.minute)
  if (hotIdx.length === 0) return []
  const first = Math.min(...hotIdx)
  const last = Math.max(...hotIdx)
  const anomalies: Anomaly[] = []
  let open: Anomaly | null = null
  for (const p of points) {
    if (p.minute < first || p.minute > last) continue
    if (p.tempC < FLOOR) {
      if (!open) open = { kind: 'temperature-drop below 400°C during hold', fromMinute: p.minute, toMinute: p.minute, minTempC: p.tempC }
      else {
        open.toMinute = p.minute
        open.minTempC = Math.min(open.minTempC, p.tempC)
      }
    } else if (open) {
      anomalies.push(open)
      open = null
    }
  }
  if (open) anomalies.push(open)
  return anomalies
}

export async function buildCompliance(projectId: string): Promise<{
  requirements: RequirementState[]
  site: { id: string; title: string; state: 'pass' | 'warn' | 'fail'; detail: string }[]
}> {
  const batches = (
    await pool.query(
      `SELECT b.id, b.code, b.opened_at, b.closed_at, b.duration_min, b.gps_lat,
              (SELECT count(*)::int FROM samples s WHERE s.batch_id = b.id) AS sample_count,
              (SELECT count(*)::int FROM telemetry t WHERE t.batch_id = b.id) AS telemetry_count,
              (SELECT count(*)::int FROM co_products c WHERE c.batch_id = b.id) AS co_product_count
       FROM batches b WHERE b.project_id = $1`,
      [projectId]
    )
  ).rows
  const sampleTotal = (
    await pool.query(
      `SELECT count(*)::int AS n FROM samples s JOIN batches b ON b.id = s.batch_id WHERE b.project_id = $1`,
      [projectId]
    )
  ).rows[0].n
  const chain = await verifyChain(projectId)
  const lag = (
    await pool.query(
      `SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (received_at - captured_at)) / 86400), 0) AS lag
       FROM field_events WHERE project_id = $1`,
      [projectId]
    )
  ).rows[0].lag

  const stockpiles = (
    await pool.query(
      `SELECT b.closed_at AS produced_at,
              (SELECT MIN(a.applied_at) FROM applications a JOIN dispatches d ON a.dispatch_id = d.id WHERE d.batch_id = b.id) AS applied_at
       FROM batches b WHERE b.project_id = $1 AND b.closed_at IS NOT NULL`,
      [projectId]
    )
  ).rows

  const facility = (
    await pool.query(`SELECT * FROM facilities WHERE project_id = $1 ORDER BY created_at LIMIT 1`, [projectId])
  ).rows[0]

  const snapshot: ComplianceSnapshot = {
    batches: batches.map((b) => ({
      id: b.code,
      openedAt: new Date(b.opened_at).toISOString(),
      closedAt: b.closed_at ? new Date(b.closed_at).toISOString() : null,
      sampleCount: b.sample_count,
      hasTemperatureLog: b.telemetry_count > 0,
      hasDurationLog: b.duration_min !== null || b.closed_at === null,
      hasGps: b.gps_lat !== null || facility?.gps_lat != null,
    })),
    initialSampleCount: sampleTotal,
    methodBActive: false,
    moistureRegime: 'every-batch',
    stackTestDoneAt: facility?.stack_test_done_at ? new Date(facility.stack_test_done_at).toISOString() : null,
    stockpiles: stockpiles.map((s) => ({
      producedAt: new Date(s.produced_at).toISOString(),
      appliedAt: s.applied_at ? new Date(s.applied_at).toISOString() : null,
    })),
    fieldSyncMaxLagDays: Math.ceil(Number(lag)),
    hashChainIntact: chain.intact,
  }

  // Site readiness, computed from onboarding data rather than hardcoded.
  const site: { id: string; title: string; state: 'pass' | 'warn' | 'fail'; detail: string }[] = []
  const calibration = await projectSource(projectId, 'calibration')
  site.push({
    id: 'SITE-SCALES',
    title: 'Calibrated weighing at plant gate',
    state: calibration ? 'pass' : 'warn',
    detail: facility?.scales_note
      ? `${facility.scales_note}${calibration ? '' : ' Action: file calibration certificates (protocol §8.4 wants calibrated scales per batch).'}`
      : 'No weighing arrangement recorded for the facility yet.',
  })
  const certCount = (
    await pool.query(
      `SELECT count(*)::int AS n FROM certificates c JOIN batches b ON b.id = c.batch_id WHERE b.project_id = $1`,
      [projectId]
    )
  ).rows[0].n
  site.push({
    id: 'SITE-LAB',
    title: 'Accredited lab results',
    state: certCount > 0 ? 'pass' : 'warn',
    detail: facility?.lab_partner
      ? `${facility.lab_partner}. ${certCount > 0 ? `${certCount} certificate(s) on file.` : 'No certificates on file yet; confirm ISO 17025 scope covers ultimate analysis, heavy metals and PAHs.'}`
      : 'No laboratory partner recorded for the facility yet.',
  })
  const appTotals = (
    await pool.query(
      `SELECT COALESCE(SUM(d.mass_kg), 0) AS dispatched,
              (SELECT COALESCE(SUM(a.applied_mass_kg), 0) FROM applications a WHERE a.project_id = $1) AS applied
       FROM dispatches d JOIN batches b ON b.id = d.batch_id WHERE b.project_id = $1`,
      [projectId]
    )
  ).rows[0]
  site.push({
    id: 'SITE-APPLICATION',
    title: 'End-use evidence pathway',
    state: Number(appTotals.dispatched) > 0 && Number(appTotals.applied) >= Number(appTotals.dispatched) * 0.8 ? 'pass' : 'warn',
    detail: `${Math.round(Number(appTotals.dispatched))} kg dispatched, ${Math.round(Number(appTotals.applied))} kg with application evidence. Credits issue only at soil application; close the loop on every dispatch.`,
  })
  const activationMass = (
    await pool.query(
      `SELECT COALESCE(SUM(c.mass_kg), 0) AS m FROM co_products c JOIN batches b ON b.id = c.batch_id
       WHERE b.project_id = $1 AND c.kind = 'biochar' AND c.fate ILIKE '%activat%'`,
      [projectId]
    )
  ).rows[0]
  if (Number(activationMass.m) > 0) {
    site.push({
      id: 'SITE-ACTIVATION',
      title: 'Activated biochar line excluded from crediting',
      state: 'fail',
      detail: `${Math.round(Number(activationMass.m))} kg routed to activation: a non-storage end use that earns no removal credits and must be mass-balanced out of every GHG statement.`,
    })
  }
  const undeclared = batches.filter((b) => b.closed_at && b.co_product_count === 0)
  site.push({
    id: 'R-3MBJ-0',
    title: 'Every co-product declared with its fate',
    state: undeclared.length ? 'warn' : 'pass',
    detail: undeclared.length
      ? `${undeclared.length} closed batch(es) with no co-product declarations`
      : 'Co-products declared on every closed batch.',
  })

  return { requirements: requirementStates(snapshot), site }
}

export async function buildCertifyPayload(projectId: string, code: string) {
  const bundle = await buildLedger(projectId, code)
  if (!bundle) return null
  const batch = await resolveBatch(projectId, code)
  const samples = (await pool.query(`SELECT * FROM samples WHERE batch_id = $1 ORDER BY label`, [batch.id])).rows
  const telemetryCount = (
    await pool.query(`SELECT count(*)::int AS n FROM telemetry WHERE batch_id = $1`, [batch.id])
  ).rows[0].n
  const lots = (
    await pool.query(`SELECT * FROM lots WHERE project_id = $1 AND (batch_id = $2 OR batch_id IS NULL) ORDER BY id`, [
      projectId,
      batch.id,
    ])
  ).rows

  return {
    mode: 'mock' as const,
    note: 'Shapes mirror the Isometric Certify API (docs.isometric.com). Set ISOMETRIC_API_KEY and ISOMETRIC_CLIENT_SECRET to submit.',
    payload: {
      feedstock_batch: {
        external_reference: `${code}-feedstock`,
        feedstock_type: 'agricultural_residue',
        mass_kg: batch.feedstock_mass_kg === null ? null : Number(batch.feedstock_mass_kg),
        lots: lots.map((l) => ({
          external_reference: l.id,
          hopper_mass_kg: Number(l.hopper_mass_kg),
          weighbridge_slip_kg: l.weighbridge_slip_kg ? Number(l.weighbridge_slip_kg) : null,
        })),
      },
      production_batch: {
        external_reference: code,
        started_at: batch.opened_at,
        ended_at: batch.closed_at,
        duration_minutes: batch.duration_min,
        biochar_mass_wet_kg: Number(batch.biochar_wet_kg),
        moisture_fraction: Number(batch.biochar_moisture_frac),
        location: batch.gps_lat === null ? null : { lat: Number(batch.gps_lat), lng: Number(batch.gps_lng) },
      },
      measurement_samples: samples.map((s) => ({
        external_reference: s.label,
        sample_type: 'production_batch',
        taken_at: s.taken_at,
        composited: false,
      })),
      sensor_series: {
        sensor_reference: `${code}-reactor-temp`,
        aggregation_seconds: 60,
        points: telemetryCount,
        format: 'parquet',
      },
      ghg_entry: {
        gross_stored_tco2e: bundle.result.grossT,
        durability_factor: bundle.result.fDurable,
        deductions_tco2e: bundle.result.deductionsT,
        counterfactual_tco2e: bundle.result.counterfactualT,
        net_removal_tco2e_conservative: bundle.result.netConservativeT,
      },
    },
  }
}
