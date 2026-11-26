/**
 * Storage locations and stock. Every unit in storage sits at a location; a
 * transfer moves it and leaves a custody event; a delivered unit that comes
 * back is returned to a location; a stock count compares the units people
 * found with the units the records say are there.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject, type SessionUser } from './auth.js'
import { newId, pool } from './db.js'

async function addEvent(unitId: string, kind: string, detail: Record<string, unknown>) {
  await pool.query(`INSERT INTO unit_events (unit_id, kind, detail) VALUES ($1, $2, $3)`, [unitId, kind, JSON.stringify(detail)])
}

async function location(projectId: string, id: unknown) {
  if (!id) return null
  return (await pool.query(`SELECT * FROM storage_locations WHERE id = $1 AND project_id = $2`, [id, projectId])).rows[0] ?? null
}

export function registerStorageRoutes(app: FastifyInstance): void {
  /** Locations with the stock each holds now. Units with no location show as unplaced. */
  app.get('/storage', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const locs = (await pool.query(`SELECT * FROM storage_locations WHERE project_id = $1 ORDER BY name`, [ctx.projectId])).rows
    const units = (
      await pool.query(
        `SELECT u.id, u.kind, u.material, u.mass_kg, u.location_id, b.code FROM units u LEFT JOIN batches b ON b.id = u.origin_batch_id
         WHERE u.project_id = $1 AND u.status = 'in-storage' ORDER BY u.id`,
        [ctx.projectId]
      )
    ).rows
    const shape = (u: Record<string, unknown>) => ({ id: u.id as string, kind: u.kind as string, material: u.material as string, massKg: Number(u.mass_kg), batch: (u.code as string) ?? null })
    const counts = (
      await pool.query(
        `SELECT DISTINCT ON (location_id) location_id, counted_at, missing, extra FROM stock_counts WHERE project_id = $1 ORDER BY location_id, counted_at DESC`,
        [ctx.projectId]
      )
    ).rows
    return {
      locations: locs.map((l) => {
        const here = units.filter((u) => u.location_id === l.id)
        const last = counts.find((c) => c.location_id === l.id)
        return {
          id: l.id as string,
          name: l.name as string,
          kind: l.kind as string,
          units: here.map(shape),
          massKg: here.reduce((n, u) => n + Number(u.mass_kg), 0),
          lastCount: last ? { at: last.counted_at, missing: last.missing as string[], extra: last.extra as string[] } : null,
        }
      }),
      unplaced: units.filter((u) => !u.location_id).map(shape),
    }
  })

  app.post('/storage', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const b = (req.body ?? {}) as { name?: string; kind?: string }
    const name = (b.name ?? '').trim()
    if (!name) return reply.code(400).send({ error: 'Name the location.' })
    if (!['silo', 'warehouse', 'yard', 'customer-site', 'other'].includes(b.kind ?? '')) {
      return reply.code(400).send({ error: 'Choose a kind: silo, warehouse, yard, customer-site or other.' })
    }
    const id = newId('loc')
    await pool.query(`INSERT INTO storage_locations (id, project_id, name, kind) VALUES ($1, $2, $3, $4)`, [id, ctx.projectId, name.slice(0, 120), b.kind])
    return { id }
  })

  /** Move units in storage to a location, one custody event each. */
  app.post('/storage/:id/transfer', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const to = await location(ctx.projectId, (req.params as { id: string }).id)
    if (!to) return reply.code(404).send({ error: 'No such location in this project.' })
    const ids = ((req.body ?? {}) as { unitIds?: string[] }).unitIds ?? []
    if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'Name the units to move.' })
    const { rows } = await pool.query(
      `SELECT u.id, u.location_id, l.name AS from_name FROM units u LEFT JOIN storage_locations l ON l.id = u.location_id
       WHERE u.id = ANY($1) AND u.project_id = $2 AND u.status = 'in-storage'`,
      [ids, ctx.projectId]
    )
    if (rows.length !== ids.length) return reply.code(400).send({ error: 'Every unit must exist and be in storage.' })
    for (const u of rows) {
      if (u.location_id === to.id) continue
      await pool.query(`UPDATE units SET location_id = $1 WHERE id = $2`, [to.id, u.id])
      await addEvent(u.id, 'moved', { from: u.from_name ?? 'no location', to: to.name })
    }
    return { moved: rows.filter((u) => u.location_id !== to.id).length }
  })

  /** A delivered unit that came back goes into storage again, at a location. */
  app.post('/units/:id/return', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as { locationId?: string; reason?: string }
    const to = await location(ctx.projectId, b.locationId)
    if (!to) return reply.code(400).send({ error: 'Choose the location it went back to.' })
    const r = await pool.query(
      `UPDATE units SET status = 'in-storage', location_id = $1 WHERE id = $2 AND project_id = $3 AND status = 'delivered'`,
      [to.id, id, ctx.projectId]
    )
    if (!r.rowCount) return reply.code(404).send({ error: 'Only a delivered unit can be returned.' })
    await addEvent(id, 'returned', { to: to.name, reason: b.reason?.trim() || null })
    return { ok: true }
  })

  /** Record a stock count: the unit labels found at a location. */
  app.post('/storage/:id/counts', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const user = (req as { user?: SessionUser }).user
    const loc = await location(ctx.projectId, (req.params as { id: string }).id)
    if (!loc) return reply.code(404).send({ error: 'No such location in this project.' })
    const found = [...new Set((((req.body ?? {}) as { found?: string[] }).found ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))]
    const expected = (
      await pool.query(`SELECT id FROM units WHERE location_id = $1 AND project_id = $2 AND status = 'in-storage'`, [loc.id, ctx.projectId])
    ).rows.map((r) => r.id as string)
    const missing = expected.filter((e) => !found.includes(e))
    const extra = found.filter((f) => !expected.includes(f))
    await pool.query(
      `INSERT INTO stock_counts (id, project_id, location_id, found, missing, extra, counted_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [newId('cnt'), ctx.projectId, loc.id, found, missing, extra, user?.email ?? null]
    )
    return { expected: expected.length, found: found.length, missing, extra }
  })
}
