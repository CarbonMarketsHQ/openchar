/**
 * The calibration register: every measuring instrument at the plant, its
 * calibration history, and when the next calibration falls due. The console
 * warns 30 days ahead. Email alerts to workspace admins are opt-in per server
 * (CALIBRATION_ALERT_EMAILS=1), so a server never mails anyone unless its
 * operator chose that.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { newId, pool } from './db.js'
import { sendMail } from './mail.js'

export const INSTRUMENT_KINDS = [
  'scale',
  'thermocouple',
  'moisture-meter',
  'flow-meter',
  'energy-meter',
  'gas-analyser',
  'other',
] as const

export const CALIBRATION_RESULTS = ['pass', 'adjusted', 'fail'] as const
export const DUE_SOON_DAYS = 30
const DAY = 86400000

export type InstrumentState = 'current' | 'due-soon' | 'overdue' | 'never' | 'failed'

/** YYYY-MM-DD for a date column, without a time-zone shift. */
const ymd = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

function stateFor(due: string | null, lastResult: string | null, today = new Date()): InstrumentState {
  if (!due) return 'never'
  if (lastResult === 'fail') return 'failed'
  const days = (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${ymd(today)}T00:00:00Z`)) / DAY
  if (days < 0) return 'overdue'
  if (days <= DUE_SOON_DAYS) return 'due-soon'
  return 'current'
}

export type InstrumentView = {
  id: string
  name: string
  kind: string
  serial: string | null
  facilityId: string | null
  intervalDays: number
  lastCalibratedAt: string | null
  lastResult: string | null
  dueOn: string | null
  daysToDue: number | null
  state: InstrumentState
}

export async function instrumentsFor(projectId: string): Promise<InstrumentView[]> {
  const { rows } = await pool.query(
    `SELECT i.*, c.calibrated_on::text AS last_on, c.next_due::text AS due_on, c.result AS last_result
     FROM instruments i
     LEFT JOIN LATERAL (
       SELECT calibrated_on, next_due, result FROM calibrations WHERE instrument_id = i.id
       ORDER BY calibrated_on DESC, created_at DESC LIMIT 1
     ) c ON true
     WHERE i.project_id = $1 ORDER BY i.name`,
    [projectId]
  )
  const today = Date.parse(`${ymd(new Date())}T00:00:00Z`)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    serial: r.serial,
    facilityId: r.facility_id,
    intervalDays: r.interval_days,
    lastCalibratedAt: r.last_on,
    lastResult: r.last_result,
    dueOn: r.due_on,
    daysToDue: r.due_on ? Math.round((Date.parse(`${r.due_on}T00:00:00Z`) - today) / DAY) : null,
    state: stateFor(r.due_on, r.last_result),
  }))
}

export function registerCalibrationRoutes(app: FastifyInstance): void {
  app.get('/instruments', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const instruments = await instrumentsFor(ctx.projectId)
    const { rows } = await pool.query(
      `SELECT c.*, c.calibrated_on::text AS on_text, c.next_due::text AS due_text, i.name AS instrument_name
       FROM calibrations c JOIN instruments i ON i.id = c.instrument_id
       WHERE i.project_id = $1 ORDER BY c.calibrated_on DESC, c.created_at DESC LIMIT 100`,
      [ctx.projectId]
    )
    const count = (s: InstrumentState) => instruments.filter((i) => i.state === s).length
    return {
      kinds: INSTRUMENT_KINDS,
      dueSoonDays: DUE_SOON_DAYS,
      instruments,
      counts: { current: count('current'), dueSoon: count('due-soon'), overdue: count('overdue'), never: count('never'), failed: count('failed') },
      history: rows.map((c) => ({
        id: c.id,
        instrumentId: c.instrument_id,
        instrumentName: c.instrument_name,
        calibratedOn: c.on_text,
        nextDue: c.due_text,
        performedBy: c.performed_by,
        result: c.result,
        sourceId: c.source_id,
        note: c.note,
      })),
    }
  })

  app.post('/instruments', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const b = (req.body ?? {}) as { name?: string; kind?: string; serial?: string; intervalDays?: number | string; facilityId?: string }
    const name = (b.name ?? '').trim()
    if (!name) return reply.code(400).send({ error: 'Name the instrument.' })
    if (!INSTRUMENT_KINDS.includes(b.kind as never)) {
      return reply.code(400).send({ error: `Choose a kind: ${INSTRUMENT_KINDS.join(', ')}.` })
    }
    const interval = Math.round(Number(b.intervalDays))
    if (!Number.isFinite(interval) || interval < 1 || interval > 3650) {
      return reply.code(400).send({ error: 'The calibration interval is a number of days between 1 and 3650.' })
    }
    if (b.facilityId) {
      const f = await pool.query(`SELECT 1 FROM facilities WHERE id = $1 AND project_id = $2`, [b.facilityId, ctx.projectId])
      if (!f.rows.length) return reply.code(404).send({ error: 'That facility is not in this project.' })
    }
    const id = newId('ins')
    await pool.query(
      `INSERT INTO instruments (id, project_id, facility_id, name, kind, serial, interval_days) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, ctx.projectId, b.facilityId || null, name.slice(0, 120), b.kind, b.serial?.trim() || null, interval]
    )
    return { id }
  })

  /** Record a calibration. The next due date defaults to the date plus the
   * instrument's interval. */
  app.post('/instruments/:id/calibrations', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as { calibratedOn?: string; nextDue?: string; performedBy?: string; result?: string; sourceId?: string; note?: string }
    const inst = (await pool.query(`SELECT * FROM instruments WHERE id = $1 AND project_id = $2`, [id, ctx.projectId])).rows[0]
    if (!inst) return reply.code(404).send({ error: 'No such instrument in this project.' })
    const on = /^\d{4}-\d{2}-\d{2}$/.test(b.calibratedOn ?? '') ? b.calibratedOn! : null
    if (!on) return reply.code(400).send({ error: 'Give the calibration date as YYYY-MM-DD.' })
    if (on > ymd(new Date(Date.now() + DAY))) return reply.code(400).send({ error: 'The calibration date is in the future.' })
    if (!CALIBRATION_RESULTS.includes(b.result as never)) {
      return reply.code(400).send({ error: 'The result is pass, adjusted or fail.' })
    }
    if (!(b.performedBy ?? '').trim()) return reply.code(400).send({ error: 'Say who calibrated it.' })
    let due = ymd(new Date(Date.parse(`${on}T00:00:00Z`) + inst.interval_days * DAY))
    if (b.nextDue) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.nextDue) || b.nextDue <= on) {
        return reply.code(400).send({ error: 'The next due date has to come after the calibration date.' })
      }
      due = b.nextDue
    }
    if (b.sourceId) {
      const s = await pool.query(`SELECT 1 FROM sources WHERE id = $1 AND project_id = $2`, [b.sourceId, ctx.projectId])
      if (!s.rows.length) return reply.code(404).send({ error: 'That certificate is not in this project.' })
    }
    const cid = newId('cal')
    await pool.query(
      `INSERT INTO calibrations (id, instrument_id, calibrated_on, next_due, performed_by, result, source_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [cid, id, on, due, b.performedBy!.trim().slice(0, 160), b.result, b.sourceId || null, b.note?.trim() || null]
    )
    return { id: cid, nextDue: due }
  })
}

/** Mail each workspace's admins once per instrument and due date when a
 * calibration comes within 30 days or lapses. Off unless the operator sets
 * CALIBRATION_ALERT_EMAILS=1. */
export async function sendCalibrationAlerts(): Promise<number> {
  if (process.env.CALIBRATION_ALERT_EMAILS !== '1') return 0
  const { rows: projects } = await pool.query(`SELECT id, name, workspace_id FROM projects`)
  let sent = 0
  for (const p of projects) {
    const due = (await instrumentsFor(p.id)).filter((i) => i.state === 'due-soon' || i.state === 'overdue')
    for (const i of due) {
      const kind = i.state
      const fresh = await pool.query(
        `INSERT INTO calibration_alerts (instrument_id, due_on, kind) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING 1`,
        [i.id, i.dueOn, kind]
      )
      if (!fresh.rows.length) continue
      const admins = (await pool.query(`SELECT email FROM users WHERE workspace_id = $1 AND role = 'admin'`, [p.workspace_id])).rows
      const when = i.state === 'overdue' ? `lapsed on ${i.dueOn}` : `is due on ${i.dueOn}`
      for (const a of admins) {
        await sendMail({
          to: a.email,
          subject: `Calibration ${i.state === 'overdue' ? 'lapsed' : 'due'}: ${i.name}`,
          text: `The calibration of ${i.name}${i.serial ? ` (serial ${i.serial})` : ''} at ${p.name} ${when}.\n\nRecord the new calibration in OpenChar under Calibration, with its certificate.`,
        })
        sent++
      }
    }
  }
  return sent
}
