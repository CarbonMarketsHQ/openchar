/**
 * The register of carbon sinks: where every applied kilogram of biochar ended
 * up, by type. The ledger in this version credits storage in soil, following
 * Isometric's biochar protocol v1.3. Other sinks are recorded with the same
 * evidence, but they are not credited until an accounting module for them
 * exists. Saying so plainly is safer than guessing a registry's rules.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { pool } from './db.js'

export const SINKS: Record<string, { credited: boolean; note: string }> = {
  soil: { credited: true, note: 'Credited: soil storage under Isometric biochar protocol v1.3, with the 200-year durability model.' },
  compost: { credited: false, note: 'Recorded, not credited by this ledger. Check the registry rules for biochar blended into compost before claiming it.' },
  'animal-feed': { credited: false, note: 'Recorded, not credited by this ledger. Feed additives reach soil through manure, which needs its own accounting.' },
  concrete: { credited: false, note: 'Recorded, not credited by this ledger. Biochar in concrete needs a building-materials accounting module.' },
  asphalt: { credited: false, note: 'Recorded, not credited by this ledger. Biochar in asphalt needs its own accounting module.' },
  filtration: { credited: false, note: 'Recorded, not credited by this ledger. Filter media must reach a final sink before any credit.' },
  other: { credited: false, note: 'Recorded, not credited by this ledger.' },
}

export function registerSinkRoutes(app: FastifyInstance): void {
  app.get('/sinks', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { rows } = await pool.query(
      `SELECT a.id, a.sink, a.farm_name, a.applied_mass_kg, a.applied_at, a.area_ha, b.code
       FROM applications a LEFT JOIN dispatches d ON d.id = a.dispatch_id LEFT JOIN batches b ON b.id = d.batch_id
       WHERE a.project_id = $1 ORDER BY a.applied_at DESC`,
      [ctx.projectId]
    )
    const byType = new Map<string, { massKg: number; count: number }>()
    for (const r of rows) {
      const t = byType.get(r.sink) ?? { massKg: 0, count: 0 }
      t.massKg += Number(r.applied_mass_kg)
      t.count += 1
      byType.set(r.sink, t)
    }
    return {
      types: Object.entries(SINKS).map(([value, v]) => ({ value, ...v })),
      summary: [...byType.entries()]
        .map(([sink, v]) => ({ sink, ...v, credited: SINKS[sink]?.credited ?? false, note: SINKS[sink]?.note ?? SINKS.other.note }))
        .sort((a, b) => b.massKg - a.massKg),
      applications: rows.map((r) => ({
        id: r.id as string,
        sink: r.sink as string,
        site: r.farm_name as string,
        massKg: Number(r.applied_mass_kg),
        areaHa: r.area_ha === null ? null : Number(r.area_ha),
        appliedAt: r.applied_at,
        batch: (r.code as string) ?? null,
      })),
    }
  })

  /** Correct the sink type of a recorded application. */
  app.patch('/applications/:id/sink', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const sink = ((req.body ?? {}) as { sink?: string }).sink ?? ''
    if (!SINKS[sink]) return reply.code(400).send({ error: `Choose a sink: ${Object.keys(SINKS).join(', ')}.` })
    const r = await pool.query(`UPDATE applications SET sink = $1 WHERE id = $2 AND project_id = $3`, [sink, id, ctx.projectId])
    if (!r.rowCount) return reply.code(404).send({ error: 'No such application in this project.' })
    return { ok: true }
  })
}
