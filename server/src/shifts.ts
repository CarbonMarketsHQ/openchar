/**
 * The operator shift log: who ran the plant and when, what happened, the
 * handover to the next shift, and downtime by cause and duration. Batches
 * run during a shift are found by time, so nobody types them twice.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject, type SessionUser } from './auth.js'
import { newId, pool } from './db.js'

export const DOWNTIME_CAUSES = [
  'planned-maintenance',
  'breakdown',
  'feedstock-shortage',
  'power-outage',
  'weather',
  'quality-hold',
  'other',
] as const

const minutes = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000))

function parseTime(v: unknown): Date | null | 'invalid' {
  if (v === undefined || v === null || v === '') return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? 'invalid' : d
}

async function facilityOk(projectId: string, facilityId: unknown): Promise<boolean> {
  if (facilityId === undefined || facilityId === null || facilityId === '') return true
  const { rows } = await pool.query(`SELECT 1 FROM facilities WHERE id = $1 AND project_id = $2`, [facilityId, projectId])
  return rows.length > 0
}

type ShiftRow = {
  id: string
  operator: string
  facility_id: string | null
  started_at: Date
  ended_at: Date | null
  notes: string | null
  handover: string | null
}

export function registerShiftRoutes(app: FastifyInstance): void {
  app.get('/shifts', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const limit = Math.min(Math.max(Number((req.query as { limit?: string }).limit) || 30, 1), 200)
    const { rows } = await pool.query<ShiftRow>(
      `SELECT * FROM shifts WHERE project_id = $1 ORDER BY started_at DESC LIMIT $2`,
      [ctx.projectId, limit]
    )
    const batches = (
      await pool.query(`SELECT code, opened_at, closed_at FROM batches WHERE project_id = $1`, [ctx.projectId])
    ).rows as { code: string; opened_at: Date; closed_at: Date | null }[]
    const downtime = (
      await pool.query(`SELECT started_at, ended_at FROM downtime WHERE project_id = $1`, [ctx.projectId])
    ).rows as { started_at: Date; ended_at: Date | null }[]
    const now = new Date()
    const shifts = rows.map((s) => {
      const end = s.ended_at ?? now
      const overlap = (a: Date, b: Date) => a < end && b > s.started_at
      const downMin = downtime
        .filter((d) => overlap(d.started_at, d.ended_at ?? now))
        .reduce((n, d) => {
          const from = d.started_at > s.started_at ? d.started_at : s.started_at
          const to = (d.ended_at ?? now) < end ? (d.ended_at ?? now) : end
          return n + minutes(from, to)
        }, 0)
      return {
        id: s.id,
        operator: s.operator,
        facilityId: s.facility_id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        durationMin: minutes(s.started_at, end),
        notes: s.notes,
        handover: s.handover,
        batches: batches
          .filter((b) => overlap(b.opened_at, b.closed_at ?? now))
          .map((b) => b.code)
          .sort(),
        downtimeMin: downMin,
      }
    })
    const lastHandover = shifts.find((s) => s.endedAt && s.handover) ?? null
    return { open: shifts.filter((s) => !s.endedAt), shifts, lastHandover }
  })

  app.post('/shifts', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const user = (req as { user?: SessionUser }).user
    const b = (req.body ?? {}) as { operator?: string; facilityId?: string; startedAt?: string; notes?: string }
    const operator = (b.operator ?? '').trim()
    if (!operator) return reply.code(400).send({ error: 'Name the operator on shift.' })
    const started = parseTime(b.startedAt)
    if (started === 'invalid') return reply.code(400).send({ error: 'The start time is not a valid time.' })
    if (!(await facilityOk(ctx.projectId, b.facilityId))) return reply.code(404).send({ error: 'That facility is not in this project.' })
    const open = await pool.query(
      `SELECT operator FROM shifts WHERE project_id = $1 AND ended_at IS NULL AND facility_id IS NOT DISTINCT FROM $2`,
      [ctx.projectId, b.facilityId || null]
    )
    if (open.rows.length) {
      return reply.code(409).send({ error: `${open.rows[0].operator} is still on shift. End that shift with a handover first.` })
    }
    const id = newId('shf')
    await pool.query(
      `INSERT INTO shifts (id, project_id, facility_id, operator, started_at, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, ctx.projectId, b.facilityId || null, operator.slice(0, 120), started ?? new Date(), b.notes?.trim() || null, user?.id ?? null]
    )
    return { id }
  })

  app.patch('/shifts/:id', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as { endedAt?: string; end?: boolean; notes?: string; handover?: string }
    const s = (await pool.query<ShiftRow>(`SELECT * FROM shifts WHERE id = $1 AND project_id = $2`, [id, ctx.projectId])).rows[0]
    if (!s) return reply.code(404).send({ error: 'No such shift.' })
    let ended: Date | null = s.ended_at
    if (b.end || b.endedAt) {
      const t = parseTime(b.endedAt)
      if (t === 'invalid') return reply.code(400).send({ error: 'The end time is not a valid time.' })
      ended = t ?? new Date()
      if (ended <= s.started_at) return reply.code(400).send({ error: 'A shift has to end after it starts.' })
      if (!(b.handover ?? s.handover ?? '').trim()) {
        return reply.code(400).send({ error: 'Write a handover for the next shift before ending this one.' })
      }
    }
    await pool.query(`UPDATE shifts SET ended_at = $1, notes = $2, handover = $3 WHERE id = $4`, [
      ended,
      b.notes !== undefined ? b.notes.trim() || null : s.notes,
      b.handover !== undefined ? b.handover.trim() || null : s.handover,
      id,
    ])
    return { ok: true }
  })

  /** Downtime entries and the month's minutes by cause (?month=2026-11). */
  app.get('/downtime', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const q = req.query as { month?: string }
    const month = /^\d{4}-\d{2}$/.test(q.month ?? '') ? q.month! : new Date().toISOString().slice(0, 7)
    const from = new Date(`${month}-01T00:00:00Z`)
    const to = new Date(from)
    to.setUTCMonth(to.getUTCMonth() + 1)
    const now = new Date()
    const { rows } = await pool.query(
      `SELECT * FROM downtime WHERE project_id = $1 AND started_at < $3 AND (ended_at IS NULL OR ended_at > $2)
       ORDER BY started_at DESC`,
      [ctx.projectId, from, to]
    )
    const byCause = new Map<string, { minutes: number; count: number }>()
    let total = 0
    const entries = rows.map((d) => {
      const end = d.ended_at ?? now
      const clipped = minutes(d.started_at > from ? d.started_at : from, end < to ? end : to)
      total += clipped
      const c = byCause.get(d.cause) ?? { minutes: 0, count: 0 }
      c.minutes += clipped
      c.count += 1
      byCause.set(d.cause, c)
      return {
        id: d.id,
        cause: d.cause,
        facilityId: d.facility_id,
        startedAt: d.started_at,
        endedAt: d.ended_at,
        durationMin: minutes(d.started_at, end),
        note: d.note,
      }
    })
    const summary = [...byCause.entries()]
      .map(([cause, v]) => ({ cause, ...v }))
      .sort((a, b) => b.minutes - a.minutes)
    return { month, causes: DOWNTIME_CAUSES, entries, summary, totalMin: total, ongoing: entries.filter((e) => !e.endedAt) }
  })

  app.post('/downtime', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const user = (req as { user?: SessionUser }).user
    const b = (req.body ?? {}) as { cause?: string; startedAt?: string; endedAt?: string; note?: string; facilityId?: string }
    if (!DOWNTIME_CAUSES.includes(b.cause as never)) {
      return reply.code(400).send({ error: `Choose a cause: ${DOWNTIME_CAUSES.join(', ')}.` })
    }
    const started = parseTime(b.startedAt)
    const ended = parseTime(b.endedAt)
    if (started === 'invalid' || ended === 'invalid') return reply.code(400).send({ error: 'A time is not valid.' })
    const start = started ?? new Date()
    if (ended && ended <= start) return reply.code(400).send({ error: 'Downtime has to end after it starts.' })
    if (!(await facilityOk(ctx.projectId, b.facilityId))) return reply.code(404).send({ error: 'That facility is not in this project.' })
    const id = newId('dwn')
    await pool.query(
      `INSERT INTO downtime (id, project_id, facility_id, cause, started_at, ended_at, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, ctx.projectId, b.facilityId || null, b.cause, start, ended, b.note?.trim() || null, user?.id ?? null]
    )
    return { id }
  })

  app.patch('/downtime/:id', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as { endedAt?: string; note?: string }
    const d = (await pool.query(`SELECT * FROM downtime WHERE id = $1 AND project_id = $2`, [id, ctx.projectId])).rows[0]
    if (!d) return reply.code(404).send({ error: 'No such downtime entry.' })
    const t = parseTime(b.endedAt)
    if (t === 'invalid') return reply.code(400).send({ error: 'The end time is not a valid time.' })
    const ended = t ?? new Date()
    if (ended <= d.started_at) return reply.code(400).send({ error: 'Downtime has to end after it starts.' })
    await pool.query(`UPDATE downtime SET ended_at = $1, note = $2 WHERE id = $3`, [
      ended,
      b.note !== undefined ? b.note.trim() || null : d.note,
      id,
    ])
    return { ok: true }
  })
}
