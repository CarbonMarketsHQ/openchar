/**
 * Trends across batches and months: dry biochar yield, throughput per day and
 * per shift, reactor residence time, and energy per dry tonne. Each figure is
 * computed from records already in OpenChar, and a batch without the record a
 * figure needs shows a gap rather than a guess.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { pool } from './db.js'
import { batchElectricity, co2eT } from './energy.js'

const r1 = (n: number) => Math.round(n * 10) / 10
const DAY = 86400000

export async function trendsFor(projectId: string) {
  const batches = (await pool.query(`SELECT * FROM batches WHERE project_id = $1 ORDER BY opened_at`, [projectId])).rows
  const shifts = (await pool.query(`SELECT started_at, ended_at FROM shifts WHERE project_id = $1`, [projectId])).rows
  const now = Date.now()
  const out = []
  for (const b of batches) {
    const lots = (await pool.query(`SELECT hopper_mass_kg, moisture_frac FROM lots WHERE batch_id = $1`, [b.id])).rows
    const lotMass = lots.reduce((n, l) => n + Number(l.hopper_mass_kg), 0)
    const moisture = lotMass ? lots.reduce((n, l) => n + Number(l.hopper_mass_kg) * Number(l.moisture_frac ?? 0), 0) / lotMass : null
    const feed = b.feedstock_mass_kg === null ? null : Number(b.feedstock_mass_kg)
    const feedDry = feed !== null && moisture !== null ? feed * (1 - moisture) : null
    const charDry = b.biochar_wet_kg === null ? null : Number(b.biochar_wet_kg) * (1 - Number(b.biochar_moisture_frac ?? 0))
    const from = new Date(b.opened_at).getTime()
    const to = b.closed_at ? new Date(b.closed_at).getTime() : now
    const days = (to - from) / DAY
    const shiftCount = shifts.filter((s) => new Date(s.started_at).getTime() < to && (s.ended_at ? new Date(s.ended_at).getTime() : now) > from).length
    const e = b.closed_at ? await batchElectricity(projectId, b) : { kwh: null }
    const fuel = (await pool.query(`SELECT fuel, quantity FROM fuel_logs WHERE batch_id = $1`, [b.id])).rows
    const fuelT = fuel.reduce((n, f) => n + co2eT(f.fuel, Number(f.quantity)), 0)
    out.push({
      code: b.code as string,
      status: b.status as string,
      openedAt: b.opened_at,
      dryYieldPct: feedDry && charDry !== null ? r1((charDry / feedDry) * 100) : null,
      throughputKgPerDay: feed !== null && days > 0.04 ? Math.round(feed / days) : null,
      throughputKgPerShift: feed !== null && shiftCount > 0 ? Math.round(feed / shiftCount) : null,
      shifts: shiftCount,
      residenceMin: b.duration_min === null ? null : Number(b.duration_min),
      kwhPerDryTonne: e.kwh !== null && charDry ? Math.round(e.kwh / (charDry / 1000)) : null,
      fuelKgCo2ePerDryTonne: charDry && fuel.length ? r1((fuelT * 1000) / (charDry / 1000)) : null,
    })
  }

  // Production by month of the batch's close (open batches are not counted yet).
  const months = new Map<string, { feedstockKg: number; biocharDryKg: number; batches: number }>()
  for (const b of batches) {
    if (!b.closed_at || b.feedstock_mass_kg === null || b.biochar_wet_kg === null) continue
    const k = new Date(b.closed_at).toISOString().slice(0, 7)
    const m = months.get(k) ?? { feedstockKg: 0, biocharDryKg: 0, batches: 0 }
    m.feedstockKg += Number(b.feedstock_mass_kg)
    m.biocharDryKg += Number(b.biochar_wet_kg) * (1 - Number(b.biochar_moisture_frac ?? 0))
    m.batches += 1
    months.set(k, m)
  }
  return {
    batches: out,
    months: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({ month, feedstockKg: Math.round(m.feedstockKg), biocharDryKg: Math.round(m.biocharDryKg), batches: m.batches })),
  }
}

export function registerTrendRoutes(app: FastifyInstance): void {
  app.get('/trends', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    return trendsFor(ctx.projectId)
  })
}
