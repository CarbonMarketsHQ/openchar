/**
 * Fuel and electricity. Fuel burned at the plant and on vehicle trips is
 * logged by type and use (reactor start-up, generator, loader, vehicle trip).
 * Electricity comes from cumulative meter readings, entered by hand, uploaded
 * as CSV or posted by a meter feed. A batch's share is the meter's rise over
 * the batch window. As with distances, the ledger only takes these figures
 * when a person applies them to the batch's run inputs.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject, type SessionUser } from './auth.js'
import { newId, pool } from './db.js'
import { resolveBatch } from './report.js'

/** Combustion factors from the IPCC 2006 Guidelines, Volume 2, Tables 1.2 and
 * 2.2 defaults: CO2 per TJ times net calorific value, per litre at a typical
 * density. Start-up wood and residue are biogenic and add no fossil CO2. */
export const FUELS: Record<string, { unit: 'l' | 'kg'; kgCo2ePerUnit: number; basis: string }> = {
  diesel: { unit: 'l', kgCo2ePerUnit: 2.68, basis: '74,100 kg CO2/TJ × 43.0 TJ/Gg × 0.84 kg/l' },
  petrol: { unit: 'l', kgCo2ePerUnit: 2.27, basis: '69,300 kg CO2/TJ × 44.3 TJ/Gg × 0.74 kg/l' },
  lpg: { unit: 'kg', kgCo2ePerUnit: 2.98, basis: '63,100 kg CO2/TJ × 47.3 TJ/Gg' },
  biomass: { unit: 'kg', kgCo2ePerUnit: 0, basis: 'Biogenic carbon, not counted as a fossil emission' },
}
export const FUEL_USES = ['reactor-startup', 'generator', 'loader', 'vehicle-trip', 'other'] as const

export const co2eT = (fuel: string, qty: number) => ((FUELS[fuel]?.kgCo2ePerUnit ?? 0) * qty) / 1000
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d

/** The meter's cumulative kWh at `at`, interpolated between the readings on
 * either side, or null when the readings do not reach that far. */
export function meterAt(readings: { at: number; kwh: number }[], at: number): number | null {
  let before: { at: number; kwh: number } | null = null
  let after: { at: number; kwh: number } | null = null
  for (const r of readings) {
    if (r.at <= at && (!before || r.at > before.at)) before = r
    if (r.at >= at && (!after || r.at < after.at)) after = r
  }
  if (!before || !after) return null
  if (after.at === before.at) return before.kwh
  return before.kwh + ((after.kwh - before.kwh) * (at - before.at)) / (after.at - before.at)
}

export async function batchElectricity(projectId: string, batch: { opened_at: Date; closed_at: Date | null }) {
  const meters = (await pool.query(`SELECT DISTINCT meter FROM meter_readings WHERE project_id = $1 ORDER BY meter`, [projectId])).rows
  if (!batch.closed_at) return { kwh: null, reason: 'The batch is still open.', meters: meters.map((m) => m.meter as string) }
  if (!meters.length) return { kwh: null, reason: 'No meter readings yet.', meters: [] }
  let total = 0
  const used: string[] = []
  for (const m of meters) {
    const readings = (
      await pool.query(`SELECT read_at, kwh FROM meter_readings WHERE project_id = $1 AND meter = $2`, [projectId, m.meter])
    ).rows.map((r) => ({ at: new Date(r.read_at).getTime(), kwh: Number(r.kwh) }))
    const from = new Date(batch.opened_at).getTime()
    const to = new Date(batch.closed_at).getTime()
    // A meter fitted after the batch, or taken out before it, played no part in it.
    const first = Math.min(...readings.map((r) => r.at))
    const last = Math.max(...readings.map((r) => r.at))
    if (first > to || last < from) continue
    const a = meterAt(readings, from)
    const b = meterAt(readings, to)
    if (a === null || b === null) {
      return { kwh: null, reason: `The ${m.meter} readings do not cover the whole batch.`, meters: meters.map((x) => x.meter as string) }
    }
    total += b - a
    used.push(m.meter as string)
  }
  if (!used.length) return { kwh: null, reason: 'No meter has readings across this batch.', meters: [] }
  return { kwh: Math.round(total * 10) / 10, reason: null, meters: used }
}

function parseReadingsCsv(csv: string): { meter: string; readAt: string; kwh: number }[] | string {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return 'The file needs a header row and at least one reading.'
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const [im, it, ik] = ['meter', 'read_at', 'kwh'].map((h) => head.indexOf(h))
  if (im < 0 || it < 0 || ik < 0) return 'The header must name the columns meter, read_at and kwh.'
  const out: { meter: string; readAt: string; kwh: number }[] = []
  for (const [i, line] of lines.slice(1).entries()) {
    const cells = line.split(',').map((c) => c.trim())
    const kwh = Number(cells[ik])
    if (!cells[im] || Number.isNaN(Date.parse(cells[it])) || !Number.isFinite(kwh)) return `Row ${i + 2} is not a valid reading.`
    out.push({ meter: cells[im], readAt: new Date(cells[it]).toISOString(), kwh })
  }
  return out
}

export function registerEnergyRoutes(app: FastifyInstance): void {
  app.get('/fuel', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { batch } = req.query as { batch?: string }
    const b = batch ? await resolveBatch(ctx.projectId, batch) : null
    if (batch && !b) return reply.code(404).send({ error: 'batch not found' })
    const { rows } = await pool.query(
      `SELECT f.*, b.code FROM fuel_logs f LEFT JOIN batches b ON b.id = f.batch_id
       WHERE f.project_id = $1 ${b ? 'AND f.batch_id = $2' : ''} ORDER BY f.logged_at DESC LIMIT 500`,
      b ? [ctx.projectId, b.id] : [ctx.projectId]
    )
    const entries = rows.map((f) => ({
      id: f.id,
      batch: f.code as string | null,
      loggedAt: f.logged_at,
      fuel: f.fuel,
      quantity: Number(f.quantity),
      unit: FUELS[f.fuel]?.unit ?? 'l',
      use: f.use,
      vehicle: f.vehicle,
      tripKm: f.trip_km === null ? null : Number(f.trip_km),
      note: f.note,
      co2eT: round(co2eT(f.fuel, Number(f.quantity))),
    }))
    return {
      fuels: Object.entries(FUELS).map(([k, v]) => ({ value: k, ...v })),
      uses: FUEL_USES,
      entries,
      totalCo2eT: round(entries.reduce((n, e) => n + e.co2eT, 0)),
    }
  })

  app.post('/fuel', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const user = (req as { user?: SessionUser }).user
    const b = (req.body ?? {}) as {
      batchCode?: string
      fuel?: string
      quantity?: number | string
      use?: string
      vehicle?: string
      tripKm?: number | string
      loggedAt?: string
      note?: string
    }
    if (!b.fuel || !FUELS[b.fuel]) return reply.code(400).send({ error: `Choose a fuel: ${Object.keys(FUELS).join(', ')}.` })
    if (!FUEL_USES.includes(b.use as never)) return reply.code(400).send({ error: `Choose a use: ${FUEL_USES.join(', ')}.` })
    const qty = Number(b.quantity)
    if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) return reply.code(400).send({ error: 'Give a quantity above zero.' })
    const trip = b.tripKm === undefined || b.tripKm === '' ? null : Number(b.tripKm)
    if (trip !== null && (!Number.isFinite(trip) || trip < 0)) return reply.code(400).send({ error: 'The trip distance is not valid.' })
    const at = b.loggedAt ? new Date(b.loggedAt) : new Date()
    if (Number.isNaN(at.getTime())) return reply.code(400).send({ error: 'The time is not valid.' })
    let batchId: string | null = null
    if (b.batchCode) {
      const batch = await resolveBatch(ctx.projectId, b.batchCode)
      if (!batch) return reply.code(404).send({ error: 'batch not found' })
      batchId = batch.id
    }
    const id = newId('ful')
    await pool.query(
      `INSERT INTO fuel_logs (id, project_id, batch_id, logged_at, fuel, quantity, use, vehicle, trip_km, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, ctx.projectId, batchId, at, b.fuel, qty, b.use, b.vehicle?.trim() || null, trip, b.note?.trim() || null, user?.id ?? null]
    )
    return { id, co2eT: round(co2eT(b.fuel, qty)) }
  })

  /** Cumulative meter readings: one, a list, or CSV (meter, read_at, kwh). */
  app.post('/meters/readings', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const body = (req.body ?? {}) as { csv?: string; readings?: { meter: string; readAt: string; kwh: number }[]; meter?: string; readAt?: string; kwh?: number }
    let readings: { meter: string; readAt: string; kwh: number }[]
    let source = 'api'
    if (typeof body.csv === 'string') {
      const parsed = parseReadingsCsv(body.csv)
      if (typeof parsed === 'string') return reply.code(400).send({ error: parsed })
      readings = parsed
      source = 'csv'
    } else if (Array.isArray(body.readings)) {
      readings = body.readings
    } else {
      readings = [{ meter: body.meter ?? '', readAt: body.readAt ?? new Date().toISOString(), kwh: Number(body.kwh) }]
      source = 'manual'
    }
    for (const r of readings) {
      if (!r.meter?.trim() || Number.isNaN(Date.parse(r.readAt)) || !Number.isFinite(Number(r.kwh)) || Number(r.kwh) < 0) {
        return reply.code(400).send({ error: 'Each reading needs a meter name, a time and a kWh total of zero or more.' })
      }
    }
    for (const r of readings) {
      await pool.query(
        `INSERT INTO meter_readings (id, project_id, meter, read_at, kwh, source) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (project_id, meter, read_at) DO UPDATE SET kwh = EXCLUDED.kwh, source = EXCLUDED.source`,
        [newId('mtr'), ctx.projectId, r.meter.trim(), new Date(r.readAt), Number(r.kwh), source]
      )
    }
    return { accepted: readings.length }
  })

  app.get('/meters', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { rows } = await pool.query(
      `SELECT meter, count(*)::int AS n, max(read_at) AS last_at,
              (array_agg(kwh ORDER BY read_at DESC))[1] AS last_kwh,
              (array_agg(source ORDER BY read_at DESC))[1] AS last_source
       FROM meter_readings WHERE project_id = $1 GROUP BY meter ORDER BY meter`,
      [ctx.projectId]
    )
    return rows.map((m) => ({ meter: m.meter, readings: m.n, lastAt: m.last_at, lastKwh: Number(m.last_kwh), lastSource: m.last_source }))
  })

  /** Fuel and electricity for one batch, next to the run inputs the ledger uses. */
  app.get('/batches/:code/energy', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { code } = req.params as { code: string }
    const batch = await resolveBatch(ctx.projectId, code)
    if (!batch) return reply.code(404).send({ error: 'batch not found' })
    const fuel = (await pool.query(`SELECT fuel, quantity, use FROM fuel_logs WHERE batch_id = $1`, [batch.id])).rows
    const byUse = new Map<string, number>()
    for (const f of fuel) byUse.set(f.use, (byUse.get(f.use) ?? 0) + co2eT(f.fuel, Number(f.quantity)))
    const ops = (await pool.query(`SELECT electricity_kwh, fuel_tco2e FROM batch_ops WHERE batch_id = $1`, [batch.id])).rows[0]
    return {
      fuel: {
        entries: fuel.length,
        co2eT: round([...byUse.values()].reduce((n, v) => n + v, 0)),
        byUse: [...byUse.entries()].map(([use, t]) => ({ use, co2eT: round(t) })),
      },
      electricity: await batchElectricity(ctx.projectId, batch),
      ledger: ops
        ? { electricityKwh: Number(ops.electricity_kwh), fuelCo2eT: ops.fuel_tco2e === null ? null : Number(ops.fuel_tco2e) }
        : null,
    }
  })

  /** Put the logged fuel or the metered electricity into the run inputs. */
  app.post('/batches/:code/energy/apply', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { code } = req.params as { code: string }
    const what = ((req.body ?? {}) as { what?: string }).what
    const batch = await resolveBatch(ctx.projectId, code)
    if (!batch) return reply.code(404).send({ error: 'batch not found' })
    if (!(await pool.query(`SELECT 1 FROM batch_ops WHERE batch_id = $1`, [batch.id])).rows.length) {
      return reply.code(400).send({ error: 'Enter the run inputs for this batch first.' })
    }
    if (what === 'fuel') {
      const fuel = (await pool.query(`SELECT fuel, quantity FROM fuel_logs WHERE batch_id = $1`, [batch.id])).rows
      if (!fuel.length) return reply.code(400).send({ error: 'No fuel is logged against this batch.' })
      const t = round(fuel.reduce((n, f) => n + co2eT(f.fuel, Number(f.quantity)), 0))
      await pool.query(`UPDATE batch_ops SET fuel_tco2e = $1 WHERE batch_id = $2`, [t, batch.id])
      return { fuelCo2eT: t }
    }
    if (what === 'electricity') {
      const e = await batchElectricity(ctx.projectId, batch)
      if (e.kwh === null) return reply.code(400).send({ error: e.reason })
      await pool.query(`UPDATE batch_ops SET electricity_kwh = $1 WHERE batch_id = $2`, [e.kwh, batch.id])
      return { electricityKwh: e.kwh }
    }
    return reply.code(400).send({ error: 'Say what to apply: fuel or electricity.' })
  })
}
