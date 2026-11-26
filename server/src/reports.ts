/**
 * Batch and monthly reports. Each report is one JSON document that the web
 * renders as a printable page (saved as PDF from the browser) and that this
 * module also writes as an Excel workbook (?format=xlsx).
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { batchBalance } from './balance.js'
import { pool } from './db.js'
import { emissionsFor } from './emissions.js'
import { batchElectricity, co2eT } from './energy.js'
import { buildLedger, resolveBatch } from './report.js'
import { workbook, type Sheet } from './xlsx.js'

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null)
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

async function projectHead(projectId: string) {
  const p = (await pool.query(`SELECT p.*, w.name AS workspace FROM projects p JOIN workspaces w ON w.id = p.workspace_id WHERE p.id = $1`, [projectId])).rows[0]
  return { id: p.id as string, name: p.name as string, district: p.district as string, workspace: p.workspace as string, synthetic: Boolean(p.synthetic) }
}

export async function batchReport(projectId: string, code: string) {
  const b = await resolveBatch(projectId, code)
  if (!b) return null
  const [project, ledger, balance] = await Promise.all([projectHead(projectId), buildLedger(projectId, code), batchBalance(projectId, code)])
  const lots = (await pool.query(`SELECT * FROM lots WHERE batch_id = $1 ORDER BY id`, [b.id])).rows
  const consignments = (
    await pool.query(
      `SELECT c.*, s.name AS supplier FROM consignments c JOIN suppliers s ON s.id = c.supplier_id JOIN lots l ON l.id = c.lot_id
       WHERE l.batch_id = $1 ORDER BY c.captured_at`,
      [b.id]
    )
  ).rows
  const samples = (await pool.query(`SELECT * FROM samples WHERE batch_id = $1 ORDER BY label`, [b.id])).rows
  const cert = (await pool.query(`SELECT c.*, s.title AS source FROM certificates c LEFT JOIN sources s ON s.id = c.source_id WHERE c.batch_id = $1`, [b.id])).rows[0]
  const coProducts = (await pool.query(`SELECT * FROM co_products WHERE batch_id = $1 ORDER BY kind, grade`, [b.id])).rows
  const units = (await pool.query(`SELECT * FROM units WHERE origin_batch_id = $1 ORDER BY id`, [b.id])).rows
  const dispatches = (
    await pool.query(
      `SELECT d.*, a.farm_name, a.applied_mass_kg, a.applied_at FROM dispatches d LEFT JOIN applications a ON a.dispatch_id = d.id
       WHERE d.batch_id = $1 ORDER BY d.dispatched_at`,
      [b.id]
    )
  ).rows
  const fuel = (await pool.query(`SELECT * FROM fuel_logs WHERE batch_id = $1 ORDER BY logged_at`, [b.id])).rows
  const telemetry = (await pool.query(`SELECT minute, temp_c FROM telemetry WHERE batch_id = $1 ORDER BY minute`, [b.id])).rows
  const operators = (
    await pool.query(
      `SELECT DISTINCT operator FROM shifts WHERE project_id = $1 AND started_at < COALESCE($3, now()) AND COALESCE(ended_at, now()) > $2 ORDER BY operator`,
      [projectId, b.opened_at, b.closed_at]
    )
  ).rows.map((r) => r.operator as string)
  const electricity = await batchElectricity(projectId, b)
  const r = ledger?.result
  return {
    kind: 'batch' as const,
    generatedAt: new Date().toISOString(),
    project,
    batch: {
      code: b.code as string,
      status: b.status as string,
      notes: b.notes as string | null,
      openedAt: iso(b.opened_at),
      closedAt: iso(b.closed_at),
      feedstockKg: num(b.feedstock_mass_kg),
      biocharWetKg: num(b.biochar_wet_kg),
      biocharMoistureFrac: num(b.biochar_moisture_frac),
      durationMin: num(b.duration_min),
      operators,
    },
    ledger: r
      ? {
          gatePass: r.gatePass,
          grossT: r.grossT,
          fDurable: r.fDurable,
          durableT: r.durableT,
          deductionsT: r.deductionsT,
          netMeanT: r.netMeanT,
          netConservativeT: r.netConservativeT,
          lines: r.lines.map((l) => ({ label: l.label, value: l.value, unit: l.unit, note: l.note ?? null })),
          datapoints: ledger.datapoints.map((d) => ({
            id: d.id,
            label: d.label,
            value: d.value,
            unit: d.unit,
            sources: d.sources.map((s) => s.title).join('; '),
          })),
          flags: r.flags,
        }
      : null,
    lab: {
      samples: samples.map((s) => ({ label: s.label, takenAt: iso(s.taken_at), state: s.state, note: s.note })),
      certificate: cert
        ? { lab: cert.lab, corgFrac: num(cert.corg_frac), hCorg: num(cert.h_corg), oCorg: num(cert.o_corg), moistureFrac: num(cert.moisture_frac), source: cert.source }
        : null,
    },
    feedstock: {
      lots: lots.map((l) => ({ id: l.id, hopperKg: num(l.hopper_mass_kg), slipKg: num(l.weighbridge_slip_kg), moistureFrac: num(l.moisture_frac) })),
      consignments: consignments.map((c) => ({
        id: c.id,
        supplier: c.supplier,
        estMassKg: num(c.est_mass_kg),
        moistureFrac: num(c.moisture_frac),
        capturedAt: iso(c.captured_at),
        lot: c.lot_id,
      })),
    },
    balance,
    coProducts: coProducts.map((c) => ({ kind: c.kind, grade: c.grade, massKg: num(c.mass_kg), fate: c.fate })),
    units: units.map((u) => ({ id: u.id, kind: u.kind, material: u.material, massKg: num(u.mass_kg), status: u.status })),
    dispatches: dispatches.map((d) => ({
      toName: d.to_name,
      massKg: num(d.mass_kg),
      dispatchedAt: iso(d.dispatched_at),
      appliedAt: iso(d.applied_at),
      farm: d.farm_name,
      appliedKg: num(d.applied_mass_kg),
    })),
    energy: {
      electricityKwh: electricity.kwh,
      fuel: fuel.map((f) => ({ loggedAt: iso(f.logged_at), fuel: f.fuel, quantity: num(f.quantity), use: f.use, co2eKg: Math.round(co2eT(f.fuel, Number(f.quantity)) * 10000) / 10 })),
    },
    telemetry: telemetry.map((t) => ({ minute: Number(t.minute), tempC: Number(t.temp_c) })),
  }
}

export async function monthReport(projectId: string, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const from = new Date(`${month}-01T00:00:00Z`)
  const to = new Date(from)
  to.setUTCMonth(to.getUTCMonth() + 1)
  const project = await projectHead(projectId)
  const inMonth = (col: string) => `${col} >= $2 AND ${col} < $3`
  const batches = (
    await pool.query(`SELECT * FROM batches WHERE project_id = $1 AND (${inMonth('opened_at')} OR ${inMonth('closed_at')}) ORDER BY opened_at`, [projectId, from, to])
  ).rows
  const batchRows = []
  for (const b of batches) {
    const l = await buildLedger(projectId, b.code)
    batchRows.push({
      code: b.code as string,
      status: b.status as string,
      openedAt: iso(b.opened_at),
      closedAt: iso(b.closed_at),
      feedstockKg: num(b.feedstock_mass_kg),
      biocharWetKg: num(b.biochar_wet_kg),
      netConservativeT: l?.result.gatePass ? l.result.netConservativeT : null,
    })
  }
  // Emissions for exactly this month: ask for enough months back to include it.
  const now = new Date()
  const back = (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + now.getUTCMonth() - from.getUTCMonth() + 1
  const em = back >= 1 && back <= 24 ? await emissionsFor(projectId, back) : null
  const emissions = em?.months.find((m) => m.month === month) ?? { month, scope1: 0, scope2: 0, scope3: 0 }
  const fuel = (await pool.query(`SELECT f.*, b.code FROM fuel_logs f LEFT JOIN batches b ON b.id = f.batch_id WHERE f.project_id = $1 AND ${inMonth('f.logged_at')} ORDER BY f.logged_at`, [projectId, from, to])).rows
  const shifts = (await pool.query(`SELECT * FROM shifts WHERE project_id = $1 AND ${inMonth('started_at')} ORDER BY started_at`, [projectId, from, to])).rows
  const downtime = (await pool.query(`SELECT * FROM downtime WHERE project_id = $1 AND ${inMonth('started_at')} ORDER BY started_at`, [projectId, from, to])).rows
  const calibrations = (
    await pool.query(
      `SELECT c.*, i.name FROM calibrations c JOIN instruments i ON i.id = c.instrument_id
       WHERE i.project_id = $1 AND c.calibrated_on >= $2::date AND c.calibrated_on < $3::date ORDER BY c.calibrated_on`,
      [projectId, from, to]
    )
  ).rows
  const consignments = (await pool.query(`SELECT count(*)::int AS n, COALESCE(sum(est_mass_kg), 0) AS kg FROM consignments WHERE project_id = $1 AND ${inMonth('captured_at')}`, [projectId, from, to])).rows[0]
  const mins = (a: unknown, b: unknown) => (b ? Math.round((new Date(b as string).getTime() - new Date(a as string).getTime()) / 60000) : null)
  return {
    kind: 'month' as const,
    generatedAt: new Date().toISOString(),
    project,
    month,
    intake: { consignments: consignments.n as number, estMassKg: Math.round(Number(consignments.kg)) },
    batches: batchRows,
    emissions: { scope1T: emissions.scope1, scope2T: emissions.scope2, scope3T: emissions.scope3 },
    fuel: fuel.map((f) => ({ loggedAt: iso(f.logged_at), batch: f.code, fuel: f.fuel, quantity: num(f.quantity), use: f.use, vehicle: f.vehicle, co2eKg: Math.round(co2eT(f.fuel, Number(f.quantity)) * 10000) / 10 })),
    shifts: shifts.map((s) => ({ operator: s.operator, startedAt: iso(s.started_at), endedAt: iso(s.ended_at), minutes: mins(s.started_at, s.ended_at), handover: s.handover })),
    downtime: downtime.map((d) => ({ cause: d.cause, startedAt: iso(d.started_at), endedAt: iso(d.ended_at), minutes: mins(d.started_at, d.ended_at), note: d.note })),
    calibrations: calibrations.map((c) => ({ instrument: c.name, calibratedOn: String(c.calibrated_on instanceof Date ? c.calibrated_on.toISOString() : c.calibrated_on).slice(0, 10), result: c.result, by: c.performed_by })),
  }
}

type BatchReport = NonNullable<Awaited<ReturnType<typeof batchReport>>>
type MonthReport = NonNullable<Awaited<ReturnType<typeof monthReport>>>

function batchWorkbook(r: BatchReport): Uint8Array {
  const sheets: Sheet[] = [
    {
      name: 'Summary',
      header: ['Field', 'Value'],
      rows: [
        ['Project', r.project.name],
        ['Workspace', r.project.workspace],
        ['Batch', r.batch.code],
        ['Status', r.batch.status],
        ['Opened', r.batch.openedAt],
        ['Closed', r.batch.closedAt],
        ['Operators (shift log)', r.batch.operators.join(', ')],
        ['Feedstock (kg, as received)', r.batch.feedstockKg],
        ['Biochar (kg, wet)', r.batch.biocharWetKg],
        ['Biochar moisture (fraction)', r.batch.biocharMoistureFrac],
        ['Residence time (min)', r.batch.durationMin],
        ['Gross stored (t CO2e)', r.ledger?.grossT],
        ['Durable fraction', r.ledger?.fDurable],
        ['Deductions (t CO2e)', r.ledger?.deductionsT],
        ['Net removal, mean (t CO2e)', r.ledger?.netMeanT],
        ['Net removal, conservative (t CO2e)', r.ledger?.netConservativeT],
        ['Electricity, metered (kWh)', r.energy.electricityKwh],
        ['Synthetic data', r.project.synthetic],
        ['Generated', r.generatedAt],
      ],
    },
  ]
  if (r.ledger) {
    sheets.push({ name: 'Ledger', header: ['Line', 'Value', 'Unit', 'Note'], rows: r.ledger.lines.map((l) => [l.label, l.value, l.unit, l.note]) })
    sheets.push({ name: 'Datapoints', header: ['Id', 'Datapoint', 'Value', 'Unit', 'Evidence'], rows: r.ledger.datapoints.map((d) => [d.id, d.label, d.value, d.unit, d.sources]) })
  }
  sheets.push({ name: 'Lots', header: ['Lot', 'Hopper (kg)', 'Weighbridge slip (kg)', 'Moisture'], rows: r.feedstock.lots.map((l) => [l.id, l.hopperKg, l.slipKg, l.moistureFrac]) })
  sheets.push({
    name: 'Consignments',
    header: ['Consignment', 'Supplier', 'Field estimate (kg)', 'Moisture', 'Captured', 'Lot'],
    rows: r.feedstock.consignments.map((c) => [c.id, c.supplier, c.estMassKg, c.moistureFrac, c.capturedAt, c.lot]),
  })
  sheets.push({ name: 'Temperatures', header: ['Minute', 'Temperature (°C)'], rows: r.telemetry.map((t) => [t.minute, t.tempC]) })
  const c = r.lab.certificate
  sheets.push({
    name: 'Lab',
    header: ['Sample', 'Taken', 'State', 'Note'],
    rows: [
      ...r.lab.samples.map((s) => [s.label, s.takenAt, s.state, s.note] as const),
      ...(c ? [[`Certificate: ${c.lab}`, `Corg ${c.corgFrac}, H/Corg ${c.hCorg}, O/Corg ${c.oCorg}, moisture ${c.moistureFrac}`, '', c.source] as const] : []),
    ].map((x) => [...x]),
  })
  sheets.push({ name: 'Co-products', header: ['Kind', 'Grade', 'Mass (kg)', 'Fate'], rows: r.coProducts.map((x) => [x.kind, x.grade, x.massKg, x.fate]) })
  sheets.push({ name: 'Units', header: ['Unit', 'Container', 'Holds', 'Mass (kg)', 'Status'], rows: r.units.map((u) => [u.id, u.kind, u.material, u.massKg, u.status]) })
  sheets.push({
    name: 'Dispatch and use',
    header: ['Dispatched to', 'Mass (kg)', 'Dispatched', 'Applied at', 'Applied (kg)', 'Applied on'],
    rows: r.dispatches.map((d) => [d.toName, d.massKg, d.dispatchedAt, d.farm, d.appliedKg, d.appliedAt]),
  })
  sheets.push({ name: 'Fuel', header: ['Logged', 'Fuel', 'Quantity', 'Use', 'kg CO2e'], rows: r.energy.fuel.map((f) => [f.loggedAt, f.fuel, f.quantity, f.use, f.co2eKg]) })
  if (r.balance) {
    sheets.push({ name: 'Balance checks', header: ['Check', 'State', 'Detail'], rows: r.balance.checks.map((x) => [x.id, x.state, x.text]) })
  }
  return workbook(sheets)
}

function monthWorkbook(r: MonthReport): Uint8Array {
  return workbook([
    {
      name: 'Summary',
      header: ['Field', 'Value'],
      rows: [
        ['Project', r.project.name],
        ['Month', r.month],
        ['Consignments received', r.intake.consignments],
        ['Feedstock, field estimate (kg)', r.intake.estMassKg],
        ['Batches opened or closed', r.batches.length],
        ['Scope 1 (t CO2e)', r.emissions.scope1T],
        ['Scope 2 (t CO2e)', r.emissions.scope2T],
        ['Scope 3 (t CO2e)', r.emissions.scope3T],
        ['Synthetic data', r.project.synthetic],
        ['Generated', r.generatedAt],
      ],
    },
    {
      name: 'Batches',
      header: ['Batch', 'Status', 'Opened', 'Closed', 'Feedstock (kg)', 'Biochar wet (kg)', 'Net conservative (t CO2e)'],
      rows: r.batches.map((b) => [b.code, b.status, b.openedAt, b.closedAt, b.feedstockKg, b.biocharWetKg, b.netConservativeT]),
    },
    { name: 'Fuel', header: ['Logged', 'Batch', 'Fuel', 'Quantity', 'Use', 'Vehicle', 'kg CO2e'], rows: r.fuel.map((f) => [f.loggedAt, f.batch, f.fuel, f.quantity, f.use, f.vehicle, f.co2eKg]) },
    { name: 'Shifts', header: ['Operator', 'Started', 'Ended', 'Minutes', 'Handover'], rows: r.shifts.map((s) => [s.operator, s.startedAt, s.endedAt, s.minutes, s.handover]) },
    { name: 'Downtime', header: ['Cause', 'Started', 'Ended', 'Minutes', 'Note'], rows: r.downtime.map((d) => [d.cause, d.startedAt, d.endedAt, d.minutes, d.note]) },
    { name: 'Calibrations', header: ['Instrument', 'Calibrated on', 'Result', 'By'], rows: r.calibrations.map((c) => [c.instrument, c.calibratedOn, c.result, c.by]) },
  ])
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function registerReportRoutes(app: FastifyInstance): void {
  app.get('/reports/batch/:code', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { code } = req.params as { code: string }
    const r = await batchReport(ctx.projectId, code)
    if (!r) return reply.code(404).send({ error: 'batch not found' })
    if ((req.query as { format?: string }).format === 'xlsx') {
      reply.header('content-type', XLSX_TYPE)
      reply.header('content-disposition', `attachment; filename="openchar-batch-${r.batch.code}.xlsx"`)
      return reply.send(Buffer.from(batchWorkbook(r)))
    }
    return r
  })

  app.get('/reports/month/:month', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { month } = req.params as { month: string }
    const r = await monthReport(ctx.projectId, month)
    if (!r) return reply.code(400).send({ error: 'Give the month as YYYY-MM.' })
    if ((req.query as { format?: string }).format === 'xlsx') {
      reply.header('content-type', XLSX_TYPE)
      reply.header('content-disposition', `attachment; filename="openchar-${month}.xlsx"`)
      return reply.send(Buffer.from(monthWorkbook(r)))
    }
    return r
  })
}
