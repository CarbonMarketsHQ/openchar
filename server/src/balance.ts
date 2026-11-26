/**
 * Mass and carbon balance for a batch. Feedstock in, measured outputs out
 * (biochar, biochar sent to other lines, bio-liquids), and gas with water
 * vapour as the remainder unless someone weighed the gas. The checks catch
 * scale and entry errors: outputs heavier than the feedstock, an implausible
 * biochar yield, a carbon yield above 100%.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { pool } from './db.js'
import { resolveBatch } from './report.js'

type Check = { id: string; state: 'pass' | 'warn' | 'fail'; text: string }

const r1 = (n: number) => Math.round(n * 10) / 10
const pct = (n: number) => Math.round(n * 1000) / 10

/** Dry biochar yield on dry feedstock that slow pyrolysis plausibly gives. */
export const YIELD_RANGE = [0.15, 0.45] as const
/** Share of feedstock carbon that plausibly ends up in the biochar. */
export const CARBON_YIELD_RANGE = [0.25, 0.75] as const
/** How close outputs and inputs must be when the gas was weighed. */
export const CLOSURE_TOLERANCE = 0.05

export async function batchBalance(projectId: string, code: string) {
  const b = await resolveBatch(projectId, code)
  if (!b) return null
  const lots = (await pool.query(`SELECT hopper_mass_kg, moisture_frac FROM lots WHERE batch_id = $1`, [b.id])).rows
  const lotMass = lots.reduce((n, l) => n + Number(l.hopper_mass_kg), 0)
  // Feedstock moisture from the lots that fed the batch, weighted by mass.
  const moisture = lotMass
    ? lots.reduce((n, l) => n + Number(l.hopper_mass_kg) * Number(l.moisture_frac ?? 0), 0) / lotMass
    : null
  const cps = (await pool.query(`SELECT kind, grade, mass_kg, fate FROM co_products WHERE batch_id = $1`, [b.id])).rows
  const cert = (await pool.query(`SELECT corg_frac FROM certificates WHERE batch_id = $1 LIMIT 1`, [b.id])).rows[0]

  const feedWet = b.feedstock_mass_kg === null ? null : Number(b.feedstock_mass_kg)
  const feedDry = feedWet !== null && moisture !== null ? feedWet * (1 - moisture) : null
  const charWet = b.biochar_wet_kg === null ? null : Number(b.biochar_wet_kg)
  const charDry = charWet !== null ? charWet * (1 - Number(b.biochar_moisture_frac ?? 0)) : null
  const liquids = cps.filter((c) => c.kind === 'bio-liquid').reduce((n, c) => n + Number(c.mass_kg), 0)
  const otherChar = cps.filter((c) => c.kind === 'biochar').reduce((n, c) => n + Number(c.mass_kg), 0)
  const gas = b.gas_mass_kg === null || b.gas_mass_kg === undefined ? null : Number(b.gas_mass_kg)

  const checks: Check[] = []
  let mass: null | {
    inputKg: number
    biocharKg: number
    otherBiocharKg: number
    liquidsKg: number
    gasKg: number
    gasMeasured: boolean
    closurePct: number | null
  } = null
  if (feedWet !== null && charWet !== null) {
    const measured = charWet + otherChar + liquids
    const residual = feedWet - measured
    mass = {
      inputKg: r1(feedWet),
      biocharKg: r1(charWet),
      otherBiocharKg: r1(otherChar),
      liquidsKg: r1(liquids),
      gasKg: r1(gas ?? residual),
      gasMeasured: gas !== null,
      closurePct: gas !== null ? pct((measured + gas) / feedWet) : null,
    }
    if (residual < 0) {
      checks.push({
        id: 'outputs-exceed-input',
        state: 'fail',
        text: `The measured outputs weigh ${Math.round(-residual).toLocaleString('en-GB')} kg more than the feedstock. Check the scales and the entries.`,
      })
    } else if (gas === null) {
      checks.push({
        id: 'outputs-within-input',
        state: 'pass',
        text: `The measured outputs are lighter than the feedstock. The other ${Math.round(residual).toLocaleString('en-GB')} kg left as gas and water vapour, which were not weighed.`,
      })
    }
    if (gas !== null) {
      const closure = (measured + gas) / feedWet
      checks.push({
        id: 'closure',
        state: Math.abs(closure - 1) <= CLOSURE_TOLERANCE ? 'pass' : 'fail',
        text: `Outputs including the weighed gas are ${pct(closure)}% of the feedstock (within ${CLOSURE_TOLERANCE * 100}% passes).`,
      })
    }
  }
  if (feedDry !== null && charDry !== null && feedDry > 0) {
    const y = charDry / feedDry
    checks.push({
      id: 'biochar-yield',
      state: y >= YIELD_RANGE[0] && y <= YIELD_RANGE[1] ? 'pass' : 'warn',
      text: `Dry biochar yield ${pct(y)}% of dry feedstock (slow pyrolysis usually gives ${YIELD_RANGE[0] * 100} to ${YIELD_RANGE[1] * 100}%).`,
    })
  }

  let carbon: null | { inputKg: number; biocharKg: number; elsewhereKg: number; yieldPct: number } = null
  const cFrac = b.feedstock_c_frac === null || b.feedstock_c_frac === undefined ? null : Number(b.feedstock_c_frac)
  const corg = cert ? Number(cert.corg_frac) : null
  if (cFrac !== null && feedDry !== null && charDry !== null && corg !== null) {
    const cin = feedDry * cFrac
    const cchar = charDry * corg
    const y = cchar / cin
    carbon = { inputKg: r1(cin), biocharKg: r1(cchar), elsewhereKg: r1(cin - cchar), yieldPct: pct(y) }
    checks.push({
      id: 'carbon-yield',
      state: y > 1 ? 'fail' : y >= CARBON_YIELD_RANGE[0] && y <= CARBON_YIELD_RANGE[1] ? 'pass' : 'warn',
      text:
        y > 1
          ? `The biochar holds ${pct(y)}% of the feedstock carbon, which is impossible. Check the feedstock carbon content and the lab result.`
          : `The biochar holds ${pct(y)}% of the feedstock carbon (${CARBON_YIELD_RANGE[0] * 100} to ${CARBON_YIELD_RANGE[1] * 100}% is usual). The rest left in the liquids and gas.`,
    })
  }

  return {
    code: b.code as string,
    feedstock: {
      wetKg: feedWet,
      moistureFrac: moisture === null ? null : Math.round(moisture * 1000) / 1000,
      dryKg: feedDry === null ? null : r1(feedDry),
      carbonFrac: cFrac,
      carbonSource: (b.feedstock_c_source as string | null) ?? null,
    },
    biochar: { dryKg: charDry === null ? null : r1(charDry), corgFrac: corg },
    mass,
    carbon,
    missing: [
      ...(feedWet === null ? ['feedstock mass'] : []),
      ...(charWet === null ? ['biochar mass'] : []),
      ...(moisture === null ? ['feedstock moisture (from the lots)'] : []),
      ...(cFrac === null ? ['feedstock carbon content'] : []),
      ...(corg === null ? ['biochar organic carbon (lab)'] : []),
    ],
    checks,
  }
}

export function registerBalanceRoutes(app: FastifyInstance): void {
  app.get('/batches/:code/balance', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const out = await batchBalance(ctx.projectId, (req.params as { code: string }).code)
    if (!out) return reply.code(404).send({ error: 'batch not found' })
    return out
  })

  /** The inputs only a person can give: feedstock carbon content and its
   * source, and the gas mass when it was weighed. */
  app.patch('/batches/:code/balance', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const b = await resolveBatch(ctx.projectId, (req.params as { code: string }).code)
    if (!b) return reply.code(404).send({ error: 'batch not found' })
    const body = (req.body ?? {}) as { feedstockCarbonPct?: number | string; feedstockCarbonSource?: string; gasKg?: number | string | null }
    let cFrac = b.feedstock_c_frac
    let source = b.feedstock_c_source
    if (body.feedstockCarbonPct !== undefined && body.feedstockCarbonPct !== '') {
      const p = Number(body.feedstockCarbonPct)
      if (!Number.isFinite(p) || p <= 0 || p >= 100) return reply.code(400).send({ error: 'Feedstock carbon is a percentage of dry mass, above 0 and below 100.' })
      if (!(body.feedstockCarbonSource ?? '').trim()) return reply.code(400).send({ error: 'Say where the carbon content comes from.' })
      cFrac = p / 100
      source = body.feedstockCarbonSource!.trim().slice(0, 200)
    }
    let gas = b.gas_mass_kg
    if (body.gasKg !== undefined) {
      if (body.gasKg === null || body.gasKg === '') gas = null
      else {
        const g = Number(body.gasKg)
        if (!Number.isFinite(g) || g < 0) return reply.code(400).send({ error: 'The gas mass is a number of kg, zero or more.' })
        gas = g
      }
    }
    await pool.query(`UPDATE batches SET feedstock_c_frac = $1, feedstock_c_source = $2, gas_mass_kg = $3 WHERE id = $4`, [cFrac, source, gas, b.id])
    return { ok: true }
  })
}
