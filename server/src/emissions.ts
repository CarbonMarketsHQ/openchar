/**
 * Operational emissions by scope, from the plant's own logs:
 *   Scope 1  fossil fuel burned at the plant and in its vehicles (fuel log)
 *   Scope 2  grid electricity (meter readings times the project's grid factor)
 *   Scope 3  feedstock collection and biochar delivery by road (t·km estimates)
 * This is a management view. A batch's ledger counts only what a person has
 * applied to its run inputs.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { pool } from './db.js'
import { distanceFor, plantPoint } from './distances.js'
import { batchElectricity, co2eT, meterAt } from './energy.js'
import { FACTORS } from './report.js'

type Scopes = { scope1: number; scope2: number; scope3: number }
const zero = (): Scopes => ({ scope1: 0, scope2: 0, scope3: 0 })
const r4 = (n: number) => Math.round(n * 1e4) / 1e4
const round = (s: Scopes): Scopes => ({ scope1: r4(s.scope1), scope2: r4(s.scope2), scope3: r4(s.scope3) })
const monthOf = (d: Date | string) => new Date(d).toISOString().slice(0, 7)

export async function emissionsFor(projectId: string, months: number) {
  const now = new Date()
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    keys.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7))
  }
  const byMonth = new Map(keys.map((k) => [k, zero()]))
  const sources = new Map<string, { scope: 1 | 2 | 3; t: number }>()
  const add = (month: string | null, scope: 1 | 2 | 3, source: string, t: number) => {
    if (t <= 0) return
    const m = month ? byMonth.get(month) : undefined
    if (month && !m) return
    if (m) m[`scope${scope}` as keyof Scopes] += t
    const s = sources.get(source) ?? { scope, t: 0 }
    s.t += t
    sources.set(source, s)
  }
  const project = (await pool.query(`SELECT grid_ef_t_per_kwh FROM projects WHERE id = $1`, [projectId])).rows[0]
  const grid = project?.grid_ef_t_per_kwh === null || project?.grid_ef_t_per_kwh === undefined ? FACTORS.gridTPerKwh.value : Number(project.grid_ef_t_per_kwh)
  const freight = FACTORS.transportTPerTKm.value
  const plant = await plantPoint(projectId)
  const USE = { 'reactor-startup': 'Reactor start-up fuel', generator: 'Generator fuel', loader: 'Loader and forklift fuel', 'vehicle-trip': 'Vehicle trips', other: 'Other fuel' } as Record<string, string>

  // Scope 1: the fuel log. Biomass is biogenic and counts nowhere here.
  const fuel = (await pool.query(`SELECT f.*, b.code FROM fuel_logs f LEFT JOIN batches b ON b.id = f.batch_id WHERE f.project_id = $1`, [projectId])).rows
  let biogenicKg = 0
  for (const f of fuel) {
    const t = co2eT(f.fuel, Number(f.quantity))
    if (f.fuel === 'biomass') biogenicKg += Number(f.quantity)
    add(monthOf(f.logged_at), 1, USE[f.use] ?? 'Other fuel', t)
  }

  // Scope 2: each meter's rise within each month, read at the month's edges.
  const readings = (await pool.query(`SELECT meter, read_at, kwh FROM meter_readings WHERE project_id = $1`, [projectId])).rows
  const meters = new Map<string, { at: number; kwh: number }[]>()
  for (const r of readings) {
    const list = meters.get(r.meter) ?? []
    list.push({ at: new Date(r.read_at).getTime(), kwh: Number(r.kwh) })
    meters.set(r.meter, list)
  }
  let gridKwh = 0
  for (const list of meters.values()) {
    const first = Math.min(...list.map((x) => x.at))
    const last = Math.max(...list.map((x) => x.at))
    for (const k of keys) {
      const start = Date.parse(`${k}-01T00:00:00Z`)
      const end = new Date(start)
      end.setUTCMonth(end.getUTCMonth() + 1)
      const a = Math.max(start, first)
      const b = Math.min(end.getTime(), last)
      if (b <= a) continue
      const kwh = (meterAt(list, b) ?? 0) - (meterAt(list, a) ?? 0)
      gridKwh += kwh
      add(k, 2, 'Grid electricity', kwh * grid)
    }
  }

  // Scope 3: road freight, collection by capture date, delivery by dispatch date.
  const cons = (
    await pool.query(
      `SELECT c.captured_at, c.est_mass_kg, c.distance_km, s.lat, s.lng FROM consignments c JOIN suppliers s ON s.id = c.supplier_id WHERE c.project_id = $1`,
      [projectId]
    )
  ).rows
  let unknownLegs = 0
  for (const c of cons) {
    const d = distanceFor(c.distance_km, c.lat === null ? null : { lat: Number(c.lat), lng: Number(c.lng) }, plant)
    if (d.km === null) unknownLegs++
    else add(monthOf(c.captured_at), 3, 'Feedstock collection', ((d.km * Number(c.est_mass_kg)) / 1000) * freight)
  }
  const disp = (
    await pool.query(
      `SELECT d.dispatched_at, d.mass_kg, d.distance_km, d.dest_lat, d.dest_lng FROM dispatches d JOIN batches b ON b.id = d.batch_id WHERE b.project_id = $1`,
      [projectId]
    )
  ).rows
  for (const d of disp) {
    const dist = distanceFor(d.distance_km, plant, d.dest_lat === null ? null : { lat: Number(d.dest_lat), lng: Number(d.dest_lng) })
    if (dist.km === null) unknownLegs++
    else add(monthOf(d.dispatched_at), 3, 'Biochar delivery', ((dist.km * Number(d.mass_kg)) / 1000) * freight)
  }

  // By batch: its fuel, its metered electricity, its collection and delivery legs.
  const batches = (await pool.query(`SELECT * FROM batches WHERE project_id = $1 ORDER BY opened_at DESC`, [projectId])).rows
  const perBatch = []
  for (const b of batches) {
    const s = zero()
    for (const f of fuel.filter((x) => x.batch_id === b.id)) s.scope1 += co2eT(f.fuel, Number(f.quantity))
    const e = await batchElectricity(projectId, b)
    if (e.kwh !== null) s.scope2 += e.kwh * grid
    const legs = (
      await pool.query(
        `SELECT c.est_mass_kg, c.distance_km, s.lat, s.lng FROM consignments c JOIN lots l ON l.id = c.lot_id
         JOIN suppliers s ON s.id = c.supplier_id WHERE l.batch_id = $1`,
        [b.id]
      )
    ).rows
    for (const c of legs) {
      const d = distanceFor(c.distance_km, c.lat === null ? null : { lat: Number(c.lat), lng: Number(c.lng) }, plant)
      if (d.km !== null) s.scope3 += ((d.km * Number(c.est_mass_kg)) / 1000) * freight
    }
    for (const d of (await pool.query(`SELECT mass_kg, distance_km, dest_lat, dest_lng FROM dispatches WHERE batch_id = $1`, [b.id])).rows) {
      const dist = distanceFor(d.distance_km, plant, d.dest_lat === null ? null : { lat: Number(d.dest_lat), lng: Number(d.dest_lng) })
      if (dist.km !== null) s.scope3 += ((dist.km * Number(d.mass_kg)) / 1000) * freight
    }
    const total = s.scope1 + s.scope2 + s.scope3
    const biocharT = b.biochar_wet_kg === null ? null : (Number(b.biochar_wet_kg) * (1 - Number(b.biochar_moisture_frac ?? 0))) / 1000
    perBatch.push({
      code: b.code as string,
      status: b.status as string,
      ...round(s),
      total: r4(total),
      electricityMeasured: e.kwh !== null,
      dryBiocharT: biocharT === null ? null : r4(biocharT),
      perDryTonne: biocharT ? r4(total / biocharT) : null,
    })
  }

  const monthsOut = keys.map((k) => ({ month: k, ...round(byMonth.get(k)!) }))
  const totals = round(monthsOut.reduce((t, m) => ({ scope1: t.scope1 + m.scope1, scope2: t.scope2 + m.scope2, scope3: t.scope3 + m.scope3 }), zero()))
  return {
    months: monthsOut,
    totals,
    total: r4(totals.scope1 + totals.scope2 + totals.scope3),
    sources: [...sources.entries()].map(([source, v]) => ({ source, scope: v.scope, co2eT: r4(v.t) })).sort((a, b) => b.co2eT - a.co2eT),
    batches: perBatch,
    notes: {
      gridFactor: grid,
      freightFactor: freight,
      gridKwh: Math.round(gridKwh),
      biogenicFuelKg: biogenicKg,
      legsWithoutDistance: unknownLegs,
    },
  }
}

export function registerEmissionsRoutes(app: FastifyInstance): void {
  app.get('/emissions', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const months = Math.min(Math.max(Number((req.query as { months?: string }).months) || 6, 1), 24)
    return emissionsFor(ctx.projectId, months)
  })
}
