/**
 * Unit-level chain of custody: physical packages (bags, silo lots) carved
 * out of a production batch, each carrying a QR-addressable identity and a
 * full lineage through splits, merges, delivery and application. This is
 * the "where did this tonne go" answer at package grain.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { pool } from './db.js'
import { resolveBatch } from './report.js'

export const CONTAINERS = ['drum', 'ibc', 'tank', 'jerrycan'] as const

async function nextUnitId(projectId: string): Promise<string> {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM units WHERE project_id = $1`, [projectId])
  let id = `U-${String(rows[0].n + 1).padStart(4, '0')}`
  while ((await pool.query(`SELECT 1 FROM units WHERE id = $1 AND project_id = $2`, [id, projectId])).rows.length) {
    id = `U-${String(rows[0].n + 1).padStart(4, '0')}-${Math.random().toString(36).slice(2, 5)}`
  }
  return id
}

async function addEvent(unitId: string, kind: string, detail: Record<string, unknown> = {}) {
  await pool.query(`INSERT INTO unit_events (unit_id, kind, detail) VALUES ($1, $2, $3)`, [
    unitId,
    kind,
    JSON.stringify(detail),
  ])
}

function shapeUnit(u: Record<string, unknown>) {
  return {
    id: u.id,
    kind: u.kind,
    material: (u.material as string) ?? 'biochar',
    coProduct: u.cp_id ? { id: u.cp_id as string, grade: u.cp_grade as string, fate: u.cp_fate as string } : null,
    massKg: Number(u.mass_kg),
    status: u.status,
    originBatch: (u.batch_code as string) ?? null,
    createdAt: u.created_at,
  }
}

export function registerUnitRoutes(app: FastifyInstance) {
  app.get('/units', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { batch } = req.query as { batch?: string }
    const { rows } = await pool.query(
      `SELECT u.*, b.code AS batch_code, cp.id AS cp_id, cp.grade AS cp_grade, cp.fate AS cp_fate
       FROM units u LEFT JOIN batches b ON b.id = u.origin_batch_id LEFT JOIN co_products cp ON cp.id = u.co_product_id
       WHERE u.project_id = $1 ${batch ? 'AND b.code = $2' : ''} ORDER BY u.id`,
      batch ? [ctx.projectId, batch] : [ctx.projectId]
    )
    return rows.map(shapeUnit)
  })

  app.post('/batches/:code/units', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { code } = req.params as { code: string }
    const batch = await resolveBatch(ctx.projectId, code)
    if (!batch) return reply.code(404).send({ error: 'batch not found' })
    const b = req.body as { count?: number; massKgEach?: number; kind?: string; locationId?: string }
    const count = Math.min(Math.max(1, Math.round(b.count ?? 1)), 200)
    const loc = b.locationId
      ? (await pool.query(`SELECT id, name FROM storage_locations WHERE id = $1 AND project_id = $2`, [b.locationId, ctx.projectId])).rows[0]
      : null
    if (b.locationId && !loc) return reply.code(404).send({ error: 'That location is not in this project.' })
    if (typeof b.massKgEach !== 'number' || b.massKgEach <= 0) {
      return reply.code(400).send({ error: 'massKgEach must be a positive number' })
    }
    const created: string[] = []
    for (let i = 0; i < count; i++) {
      const id = await nextUnitId(ctx.projectId)
      await pool.query(
        `INSERT INTO units (id, project_id, origin_batch_id, kind, mass_kg, location_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, ctx.projectId, batch.id, b.kind ?? 'bag', b.massKgEach, loc?.id ?? null]
      )
      await addEvent(id, 'created', { fromBatch: code, massKg: b.massKgEach, ...(loc ? { at: loc.name } : {}) })
      created.push(id)
    }
    return { created }
  })

  /** Package a co-product stream (bio-liquids, or biochar sent to another
   * line) into drums, IBCs, tanks or jerrycans, never more than the stream. */
  app.post('/co-products/:id/units', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const cp = (
      await pool.query(
        `SELECT cp.*, b.id AS batch_id, b.code FROM co_products cp JOIN batches b ON b.id = cp.batch_id
         WHERE cp.id = $1 AND b.project_id = $2`,
        [id, ctx.projectId]
      )
    ).rows[0]
    if (!cp) return reply.code(404).send({ error: 'No such co-product in this project.' })
    const b = (req.body ?? {}) as { count?: number; massKgEach?: number; kind?: string }
    const kind = b.kind ?? 'drum'
    if (!CONTAINERS.includes(kind as never)) return reply.code(400).send({ error: `Choose a container: ${CONTAINERS.join(', ')}.` })
    const count = Math.min(Math.max(1, Math.round(Number(b.count) || 1)), 200)
    const each = Number(b.massKgEach)
    if (!Number.isFinite(each) || each <= 0) return reply.code(400).send({ error: 'massKgEach must be a positive number' })
    const packed = Number(
      (await pool.query(`SELECT COALESCE(SUM(mass_kg), 0) AS m FROM units WHERE co_product_id = $1`, [id])).rows[0].m
    )
    const left = Number(cp.mass_kg) - packed
    if (count * each > left + 1e-9) {
      return reply.code(400).send({ error: `Only ${Math.round(left)} kg of this stream is left to package.` })
    }
    const created: string[] = []
    for (let i = 0; i < count; i++) {
      const uid = await nextUnitId(ctx.projectId)
      await pool.query(
        `INSERT INTO units (id, project_id, origin_batch_id, kind, mass_kg, material, co_product_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uid, ctx.projectId, cp.batch_id, kind, each, cp.kind, id]
      )
      await addEvent(uid, 'created', { fromBatch: cp.code, coProduct: `${cp.kind} grade ${cp.grade}`, massKg: each })
      created.push(uid)
    }
    return { created }
  })

  app.get('/units/:id', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const u = (
      await pool.query(
        `SELECT u.*, b.code AS batch_code, cp.id AS cp_id, cp.grade AS cp_grade, cp.fate AS cp_fate
         FROM units u LEFT JOIN batches b ON b.id = u.origin_batch_id LEFT JOIN co_products cp ON cp.id = u.co_product_id
         WHERE u.id = $1 AND u.project_id = $2`,
        [id, ctx.projectId]
      )
    ).rows[0]
    if (!u) return reply.code(404).send({ error: 'not found' })
    const events = (
      await pool.query(`SELECT kind, at, detail FROM unit_events WHERE unit_id = $1 ORDER BY at, id`, [id])
    ).rows
    const parents = (
      await pool.query(
        `SELECT p.parent_id, u2.status, u2.mass_kg, b.code AS batch_code
         FROM unit_parents p JOIN units u2 ON u2.id = p.parent_id
         LEFT JOIN batches b ON b.id = u2.origin_batch_id WHERE p.unit_id = $1`,
        [id]
      )
    ).rows
    const children = (
      await pool.query(`SELECT unit_id FROM unit_parents WHERE parent_id = $1 ORDER BY unit_id`, [id])
    ).rows
    return {
      ...shapeUnit(u),
      events: events.map((e) => ({ kind: e.kind, at: e.at, detail: e.detail })),
      parents: parents.map((p) => ({ id: p.parent_id, originBatch: p.batch_code ?? null })),
      children: children.map((c) => c.unit_id),
    }
  })

  app.post('/units/:id/split', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const b = req.body as { masses?: number[] }
    if (!Array.isArray(b.masses) || b.masses.length < 2 || b.masses.some((m) => typeof m !== 'number' || m <= 0)) {
      return reply.code(400).send({ error: 'masses must be at least two positive numbers' })
    }
    const u = (
      await pool.query(`SELECT * FROM units WHERE id = $1 AND project_id = $2 AND status = 'in-storage'`, [
        id,
        ctx.projectId,
      ])
    ).rows[0]
    if (!u) return reply.code(404).send({ error: 'unit not found or not in storage' })
    const total = b.masses.reduce((s, m) => s + m, 0)
    if (Math.abs(total - Number(u.mass_kg)) > Number(u.mass_kg) * 0.02) {
      return reply.code(400).send({
        error: `split masses total ${total} kg but the unit holds ${Number(u.mass_kg)} kg; mass must balance within 2%`,
      })
    }
    const created: string[] = []
    for (const mass of b.masses) {
      const childId = await nextUnitId(ctx.projectId)
      await pool.query(
        `INSERT INTO units (id, project_id, origin_batch_id, kind, mass_kg, material, co_product_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [childId, ctx.projectId, u.origin_batch_id, u.kind, mass, u.material, u.co_product_id]
      )
      await pool.query(`INSERT INTO unit_parents (unit_id, parent_id) VALUES ($1, $2)`, [childId, id])
      await addEvent(childId, 'created', { splitFrom: id, massKg: mass })
      created.push(childId)
    }
    await pool.query(`UPDATE units SET status = 'split' WHERE id = $1`, [id])
    await addEvent(id, 'split', { into: created })
    return { created }
  })

  app.post('/units/merge', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const b = req.body as { unitIds?: string[]; massKg?: number }
    if (!Array.isArray(b.unitIds) || b.unitIds.length < 2) {
      return reply.code(400).send({ error: 'unitIds must name at least two units' })
    }
    const { rows } = await pool.query(
      `SELECT * FROM units WHERE id = ANY($1) AND project_id = $2 AND status = 'in-storage'`,
      [b.unitIds, ctx.projectId]
    )
    if (rows.length !== b.unitIds.length) {
      return reply.code(400).send({ error: 'every unit must exist and be in storage' })
    }
    const total = rows.reduce((s, u) => s + Number(u.mass_kg), 0)
    const massKg = b.massKg ?? total
    if (Math.abs(massKg - total) > total * 0.02) {
      return reply.code(400).send({ error: `merged mass ${massKg} kg must balance the parents' ${total} kg within 2%` })
    }
    if (!rows.every((u) => u.material === rows[0].material)) {
      return reply.code(400).send({ error: 'Biochar and bio-liquid cannot be merged into one unit.' })
    }
    const sameBatch = rows.every((u) => u.origin_batch_id === rows[0].origin_batch_id)
    const sameStream = rows.every((u) => u.co_product_id === rows[0].co_product_id)
    const childId = await nextUnitId(ctx.projectId)
    await pool.query(
      `INSERT INTO units (id, project_id, origin_batch_id, kind, mass_kg, material, co_product_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [childId, ctx.projectId, sameBatch ? rows[0].origin_batch_id : null, rows[0].kind, massKg, rows[0].material, sameStream ? rows[0].co_product_id : null]
    )
    for (const u of rows) {
      await pool.query(`INSERT INTO unit_parents (unit_id, parent_id) VALUES ($1, $2)`, [childId, u.id])
      await pool.query(`UPDATE units SET status = 'merged' WHERE id = $1`, [u.id])
      await addEvent(u.id, 'merged', { into: childId })
    }
    await addEvent(childId, 'created', { mergedFrom: b.unitIds, massKg })
    return { id: childId }
  })

  app.post('/units/:id/deliver', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const b = req.body as { toName?: string }
    if (!b.toName) return reply.code(400).send({ error: 'toName is required' })
    const r = await pool.query(
      `UPDATE units SET status = 'delivered' WHERE id = $1 AND project_id = $2 AND status = 'in-storage'`,
      [id, ctx.projectId]
    )
    if (!r.rowCount) return reply.code(404).send({ error: 'unit not found or not in storage' })
    await addEvent(id, 'delivered', { toName: b.toName })
    return { ok: true }
  })

  app.post('/units/:id/apply', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const b = req.body as { farmName?: string }
    if (!b.farmName) return reply.code(400).send({ error: 'farmName is required' })
    const r = await pool.query(
      `UPDATE units SET status = 'applied' WHERE id = $1 AND project_id = $2 AND status IN ('in-storage', 'delivered')`,
      [id, ctx.projectId]
    )
    if (!r.rowCount) return reply.code(404).send({ error: 'unit not found or already closed out' })
    await addEvent(id, 'applied', { farmName: b.farmName })
    return { ok: true }
  })
}
