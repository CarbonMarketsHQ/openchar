/**
 * Possible duplicate records: one consignment captured twice, one weighbridge
 * slip used for two lots, one file uploaded twice. A person decides; a pair
 * marked "not a duplicate" is not raised again.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject, type SessionUser } from './auth.js'
import { pool } from './db.js'

export type Duplicate = { kind: 'consignment' | 'slip' | 'file'; ids: string[]; reason: string }

/** Consignments from one supplier within 1% in mass and 30 minutes apart. */
const CONSIGNMENT_MINUTES = 30
const CONSIGNMENT_MASS_SHARE = 0.01
/** Lots whose slips read the same mass within two hours. */
const SLIP_HOURS = 2

const key = (d: { kind: string; ids: string[] }) => `${d.kind}:${[...d.ids].sort().join('|')}`

export async function findDuplicates(projectId: string): Promise<Duplicate[]> {
  const out: Duplicate[] = []

  const consignments = await pool.query(
    `SELECT a.id AS a, b.id AS b, s.name AS supplier, a.est_mass_kg AS mass,
            round(abs(extract(epoch FROM (a.captured_at - b.captured_at))) / 60) AS minutes
     FROM consignments a JOIN consignments b ON a.project_id = b.project_id AND a.id < b.id
     JOIN suppliers s ON s.id = a.supplier_id
     WHERE a.project_id = $1 AND a.supplier_id = b.supplier_id
       AND abs(a.est_mass_kg - b.est_mass_kg) <= greatest(a.est_mass_kg, b.est_mass_kg) * $2
       AND abs(extract(epoch FROM (a.captured_at - b.captured_at))) <= $3 * 60`,
    [projectId, CONSIGNMENT_MASS_SHARE, CONSIGNMENT_MINUTES]
  )
  for (const r of consignments.rows) {
    out.push({
      kind: 'consignment',
      ids: [r.a, r.b],
      reason: `Same supplier (${r.supplier}), ${Math.round(Number(r.mass))} kg, captured ${r.minutes} minutes apart`,
    })
  }

  const sharedSlip = await pool.query(
    `SELECT l.slip_source_id, array_agg(l.id ORDER BY l.id) AS lots, max(s.title) AS title
     FROM lots l JOIN sources s ON s.id = l.slip_source_id
     WHERE l.project_id = $1 AND l.slip_source_id IS NOT NULL
     GROUP BY l.slip_source_id HAVING count(*) > 1`,
    [projectId]
  )
  for (const r of sharedSlip.rows) {
    out.push({ kind: 'slip', ids: r.lots, reason: `One slip recorded for ${r.lots.length} lots: ${r.title}` })
  }
  const sameMass = await pool.query(
    `SELECT a.id AS a, b.id AS b, a.weighbridge_slip_kg AS kg
     FROM lots a JOIN lots b ON a.project_id = b.project_id AND a.id < b.id
     WHERE a.project_id = $1 AND a.weighbridge_slip_kg IS NOT NULL
       AND a.weighbridge_slip_kg = b.weighbridge_slip_kg
       AND abs(extract(epoch FROM (a.created_at - b.created_at))) <= $2 * 3600
       AND (a.slip_source_id IS NULL OR b.slip_source_id IS NULL OR a.slip_source_id <> b.slip_source_id)`,
    [projectId, SLIP_HOURS]
  )
  for (const r of sameMass.rows) {
    out.push({ kind: 'slip', ids: [r.a, r.b], reason: `Both slips read ${Math.round(Number(r.kg))} kg, entered within ${SLIP_HOURS} hours` })
  }

  const files = await pool.query(
    `SELECT file_sha256, array_agg(id ORDER BY created_at, id) AS ids
     FROM sources WHERE project_id = $1 AND file_sha256 IS NOT NULL
     GROUP BY file_sha256 HAVING count(*) > 1`,
    [projectId]
  )
  for (const r of files.rows) {
    out.push({ kind: 'file', ids: r.ids, reason: `The same file was uploaded ${r.ids.length} times` })
  }

  const dismissed = new Set(
    (await pool.query(`SELECT kind, ids FROM duplicate_reviews WHERE project_id = $1`, [projectId])).rows.map((r) =>
      key({ kind: r.kind, ids: r.ids })
    )
  )
  return out.filter((d) => !dismissed.has(key(d)))
}

export function registerDuplicateRoutes(app: FastifyInstance): void {
  app.get('/duplicates', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    return findDuplicates(ctx.projectId)
  })

  /** Record a person's decision that a flagged set is not a duplicate. */
  app.post('/duplicates/dismiss', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const user = (req as { user?: SessionUser }).user
    const b = (req.body ?? {}) as { kind?: string; ids?: string[]; note?: string }
    const open = await findDuplicates(ctx.projectId)
    const match = open.find((d) => d.kind === b.kind && key(d) === key({ kind: b.kind ?? '', ids: b.ids ?? [] }))
    if (!match) return reply.code(404).send({ error: 'No such possible duplicate.' })
    await pool.query(
      `INSERT INTO duplicate_reviews (project_id, kind, ids, decided_by, note) VALUES ($1, $2, $3, $4, $5)`,
      [ctx.projectId, match.kind, [...match.ids].sort(), user?.email ?? null, b.note?.trim() || null]
    )
    return { ok: true }
  })
}
