/**
 * OpenChar API. Two layers of auth: a service bearer token on every route
 * (infrastructure-level, held by the web server), and user sessions via
 * X-Session for everything except health, the public summary and the auth
 * routes themselves. Project scoping via X-Project, validated against the
 * session's workspace on every request.
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import Fastify, { type FastifyRequest } from 'fastify'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import {
  clientIp,
  hasServiceToken,
  registerAuthRoutes,
  requireProject,
  resolveSession,
  type SessionUser,
} from './auth.js'
import { appendEvents, migrate, newId, pool, verifyChain } from './db.js'
import { buildCertifyPayload, buildCompliance, buildLedger, findAnomalies, resolveBatch } from './report.js'
import { aggregateSensorSeries, certifyConfig, certifySubmit } from './certify.js'
import { registerUnitRoutes } from './units.js'
import { startMqttIngest } from './ingest.js'
import { parquetWriteBuffer } from 'hyparquet-writer'
import { isSessionlessExtensionRoute, loadExtensions } from './extensions.js'

if (!process.env.API_TOKEN || process.env.API_TOKEN === 'change-me') {
  console.error('API_TOKEN is required: set it to a long random string (openssl rand -hex 24)')
  process.exit(1)
}
const FILES_DIR = process.env.FILES_DIR || './data/files'

type Req = FastifyRequest & { user?: SessionUser }

// Caddy sits on the compose network, so loopback and private ranges are
// the only hops whose X-Forwarded-For is believed.
const app = Fastify({
  logger: { level: 'warn' },
  bodyLimit: 20 * 1024 * 1024,
  trustProxy: ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
})
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } })
await app.register(rateLimit, { global: false, keyGenerator: clientIp })

const SESSIONLESS = new Set(['/health', '/auth/config', '/auth/login', '/auth/signup', '/auth/request-reset', '/auth/reset'])

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return
  if (!hasServiceToken(req)) {
    return reply.code(401).send({ error: 'unauthorized' })
  }
  const route = req.url.split('?')[0]
  if (SESSIONLESS.has(route) || route.startsWith('/public/') || isSessionlessExtensionRoute(route)) return
  const token = req.headers['x-session']
  if (typeof token !== 'string' || !token) return reply.code(401).send({ error: 'session required' })
  const user = await resolveSession(token)
  if (!user) return reply.code(401).send({ error: 'session expired' })
  ;(req as Req).user = user
  // The verifier seat is read-only by construction: an auditor can see
  // everything in their workspace and change nothing but their own password.
  if (
    user.role === 'verifier' &&
    req.method !== 'GET' &&
    route !== '/auth/logout' &&
    route !== '/auth/change-password'
  ) {
    return reply.code(403).send({ error: 'this account is a read-only verifier seat' })
  }
})

app.get('/health', async () => {
  const db = await pool
    .query('SELECT 1')
    .then(() => true)
    .catch(() => false)
  return { ok: true, db, service: 'openchar-api' }
})

registerAuthRoutes(app)
registerUnitRoutes(app)

/* ----------------------------------------------------------- public read */

// Nothing is public until a workspace admin publishes the project.
app.get('/public/projects/:id/summary', async (req, reply) => {
  const { id } = req.params as { id: string }
  const { rows } = await pool.query(`SELECT 1 FROM projects WHERE id = $1 AND public`, [id])
  if (!rows.length) return reply.code(404).send({ error: 'not found' })
  const summary = await projectSummary(id)
  if (!summary) return reply.code(404).send({ error: 'not found' })
  return summary
})

/* -------------------------------------------------------------- projects */

app.get('/projects', async (req) => {
  const user = (req as Req).user!
  const { rows } = await pool.query(
    `SELECT p.*, (SELECT count(*)::int FROM batches b WHERE b.project_id = p.id) AS batch_count
     FROM projects p WHERE p.workspace_id = $1 ORDER BY p.created_at`,
    [user.workspaceId]
  )
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    district: p.district,
    synthetic: p.synthetic,
    tSoilC: Number(p.t_soil_c),
    tSoilSource: p.t_soil_source,
    durabilityBasis: p.durability_basis,
    public: p.public,
    gridEfTPerKwh: p.grid_ef_t_per_kwh === null ? null : Number(p.grid_ef_t_per_kwh),
    gridEfSource: p.grid_ef_source,
    batchCount: p.batch_count,
  }))
})

app.patch('/projects/:id', async (req, reply) => {
  const user = (req as Req).user!
  if (user.role !== 'admin') return reply.code(403).send({ error: 'admins only' })
  const { id } = req.params as { id: string }
  const b = req.body as {
    name?: string
    district?: string
    tSoilC?: number
    tSoilSource?: string
    public?: boolean
    gridEfTPerKwh?: number
    gridEfSource?: string
  }
  const { rows } = await pool.query(
    `UPDATE projects SET
       name = COALESCE($3, name), district = COALESCE($4, district),
       t_soil_c = COALESCE($5, t_soil_c), t_soil_source = COALESCE($6, t_soil_source),
       public = COALESCE($7, public),
       grid_ef_t_per_kwh = COALESCE($8, grid_ef_t_per_kwh), grid_ef_source = COALESCE($9, grid_ef_source)
     WHERE id = $1 AND workspace_id = $2 RETURNING id, public`,
    [
      id,
      user.workspaceId,
      b.name ?? null,
      b.district ?? null,
      b.tSoilC ?? null,
      b.tSoilSource ?? null,
      b.public ?? null,
      b.gridEfTPerKwh ?? null,
      b.gridEfSource ?? null,
    ]
  )
  if (!rows[0]) return reply.code(404).send({ error: 'project not found in this workspace' })
  return { id: rows[0].id, public: rows[0].public }
})

app.post('/projects', async (req, reply) => {
  const user = (req as Req).user!
  const b = req.body as {
    name?: string
    district?: string
    tSoilC?: number
    tSoilSource?: string
    synthetic?: boolean
    gridEfTPerKwh?: number | null
    gridEfSource?: string | null
  }
  if (!b.name || !b.district || typeof b.tSoilC !== 'number' || !b.tSoilSource) {
    return reply.code(400).send({ error: 'name, district, tSoilC and tSoilSource are required' })
  }
  const id = newId('prj')
  await pool.query(
    `INSERT INTO projects (id, workspace_id, name, district, synthetic, t_soil_c, t_soil_source, grid_ef_t_per_kwh, grid_ef_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      user.workspaceId,
      b.name,
      b.district,
      b.synthetic ?? false,
      b.tSoilC,
      b.tSoilSource,
      typeof b.gridEfTPerKwh === 'number' ? b.gridEfTPerKwh : null,
      b.gridEfSource || null,
    ]
  )
  return { id }
})

app.get('/summary', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  return projectSummary(ctx.projectId)
})

/* ------------------------------------------------------------ facilities */

app.get('/facilities', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { rows } = await pool.query(
    `SELECT f.*, to_char(f.stack_test_done_at, 'YYYY-MM-DD') AS stack_test_text
     FROM facilities f WHERE f.project_id = $1 ORDER BY f.created_at`,
    [ctx.projectId]
  )
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    gpsLat: f.gps_lat === null ? null : Number(f.gps_lat),
    gpsLng: f.gps_lng === null ? null : Number(f.gps_lng),
    reactorMake: f.reactor_make,
    reactorType: f.reactor_type,
    nameplateTpd: f.nameplate_tpd === null ? null : Number(f.nameplate_tpd),
    scalesNote: f.scales_note,
    labPartner: f.lab_partner,
    stackTestDoneAt: f.stack_test_text ?? null,
    mqttUrl: f.mqtt_url,
    mqttTopic: f.mqtt_topic,
  }))
})

app.post('/facilities', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const b = req.body as Record<string, unknown>
  if (!b.name) return reply.code(400).send({ error: 'name is required' })
  const id = newId('fac')
  await pool.query(
    `INSERT INTO facilities (id, project_id, name, gps_lat, gps_lng, reactor_make, reactor_type, nameplate_tpd, scales_note, lab_partner, stack_test_done_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      ctx.projectId,
      b.name,
      b.gpsLat ?? null,
      b.gpsLng ?? null,
      b.reactorMake ?? null,
      b.reactorType ?? null,
      b.nameplateTpd ?? null,
      b.scalesNote ?? null,
      b.labPartner ?? null,
      b.stackTestDoneAt ?? null,
    ]
  )
  return { id }
})

app.patch('/facilities/:id', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { id } = req.params as { id: string }
  const b = req.body as Record<string, unknown>
  const map: Record<string, string> = {
    name: 'name',
    gpsLat: 'gps_lat',
    gpsLng: 'gps_lng',
    reactorMake: 'reactor_make',
    reactorType: 'reactor_type',
    nameplateTpd: 'nameplate_tpd',
    scalesNote: 'scales_note',
    labPartner: 'lab_partner',
    stackTestDoneAt: 'stack_test_done_at',
    mqttUrl: 'mqtt_url',
    mqttTopic: 'mqtt_topic',
  }
  const sets: string[] = []
  const vals: unknown[] = []
  for (const [k, col] of Object.entries(map)) {
    if (k in b) {
      vals.push(b[k])
      sets.push(`${col} = $${vals.length}`)
    }
  }
  if (!sets.length) return reply.code(400).send({ error: 'nothing to update' })
  vals.push(id, ctx.projectId)
  const r = await pool.query(
    `UPDATE facilities SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND project_id = $${vals.length}`,
    vals
  )
  if (!r.rowCount) return reply.code(404).send({ error: 'not found' })
  return { ok: true }
})

/* ------------------------------------------------------------- suppliers */

app.get('/suppliers', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { rows } = await pool.query(`SELECT * FROM suppliers WHERE project_id = $1 ORDER BY name`, [ctx.projectId])
  return rows.map((s) => ({ id: s.id, name: s.name, village: s.village, category: s.category }))
})

app.post('/suppliers', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const b = req.body as { name?: string; village?: string; category?: string; lat?: number; lng?: number }
  if (!b.name || !b.village || !b.category) {
    return reply.code(400).send({ error: 'name, village and category are required' })
  }
  const id = newId('sup')
  await pool.query(
    `INSERT INTO suppliers (id, project_id, name, village, category, lat, lng) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, ctx.projectId, b.name, b.village, b.category, b.lat ?? null, b.lng ?? null]
  )
  return { id }
})

/* ------------------------------------------------- field sync and intake */

app.get('/consignments', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { state } = req.query as { state?: string }
  const { rows } = await pool.query(
    `SELECT c.*, s.name AS supplier_name FROM consignments c JOIN suppliers s ON s.id = c.supplier_id
     WHERE c.project_id = $1 ${state ? 'AND c.state = $2' : ''} ORDER BY c.captured_at DESC`,
    state ? [ctx.projectId, state] : [ctx.projectId]
  )
  return rows.map((c) => ({
    id: c.id,
    supplierName: c.supplier_name,
    estMassKg: Number(c.est_mass_kg),
    moistureFrac: c.moisture_frac === null ? null : Number(c.moisture_frac),
    category: c.category,
    state: c.state,
    capturedAt: c.captured_at,
    lotId: c.lot_id,
    photoRef: c.photo_ref,
  }))
})

app.post('/sync', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const body = req.body as {
    events: { id: string; kind: string; capturedAt: string; deviceId: string; payload: Record<string, unknown> }[]
  }
  if (!Array.isArray(body.events)) return reply.code(400).send({ error: 'events[] required' })
  const accepted = await appendEvents(ctx.projectId, body.events)
  for (const e of body.events) {
    if (e.kind === 'consignment-captured') {
      const p = e.payload as {
        consignmentId: string
        supplierId: string
        estMassKg: number
        moistureFrac: number
        category: string
        gps?: { lat: number; lng: number }
        photoRef?: string
      }
      await pool.query(
        `INSERT INTO consignments (id, project_id, supplier_id, est_mass_kg, moisture_frac, category, state, photo_ref, gps_lat, gps_lng, captured_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'received', $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
        [
          p.consignmentId,
          ctx.projectId,
          p.supplierId,
          p.estMassKg,
          p.moistureFrac,
          p.category,
          p.photoRef ?? null,
          p.gps?.lat ?? null,
          p.gps?.lng ?? null,
          e.capturedAt,
        ]
      )
    }
  }
  return { accepted }
})

app.get('/lots', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { rows } = await pool.query(
    `SELECT l.*, b.code AS batch_code,
            (SELECT json_agg(json_build_object('id', c.id, 'estMassKg', c.est_mass_kg)) FROM consignments c WHERE c.lot_id = l.id) AS consignments
     FROM lots l LEFT JOIN batches b ON b.id = l.batch_id
     WHERE l.project_id = $1 ORDER BY l.created_at DESC`,
    [ctx.projectId]
  )
  return rows.map((l) => ({
    id: l.id,
    hopperMassKg: Number(l.hopper_mass_kg),
    weighbridgeSlipKg: l.weighbridge_slip_kg === null ? null : Number(l.weighbridge_slip_kg),
    moistureFrac: l.moisture_frac === null ? null : Number(l.moisture_frac),
    slipSourceId: l.slip_source_id,
    batchCode: l.batch_code,
    consignments: l.consignments ?? [],
    createdAt: l.created_at,
  }))
})

app.post('/lots', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const body = req.body as {
    consignmentId: string
    weighbridgeSlipKg: number
    moistureFrac: number
    slipSourceId?: string
  }
  const consignment = (
    await pool.query(`SELECT * FROM consignments WHERE id = $1 AND project_id = $2 AND state = 'received'`, [
      body.consignmentId,
      ctx.projectId,
    ])
  ).rows[0]
  if (!consignment) return reply.code(404).send({ error: 'consignment not found or already attached' })
  const count = (
    await pool.query(`SELECT count(*)::int AS n FROM lots WHERE project_id = $1`, [ctx.projectId])
  ).rows[0].n
  let id = `L-${String(count + 1).padStart(2, '0')}`
  while ((await pool.query(`SELECT 1 FROM lots WHERE id = $1`, [id])).rows.length) {
    id = `L-${String(count + 1).padStart(2, '0')}-${Math.random().toString(36).slice(2, 5)}`
  }
  await pool.query(
    `INSERT INTO lots (id, project_id, hopper_mass_kg, weighbridge_slip_kg, moisture_frac, slip_source_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, ctx.projectId, consignment.est_mass_kg, body.weighbridgeSlipKg, body.moistureFrac, body.slipSourceId ?? null]
  )
  await pool.query(`UPDATE consignments SET state = 'attached', lot_id = $1 WHERE id = $2`, [id, body.consignmentId])
  return { id }
})

app.patch('/lots/:id', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { id } = req.params as { id: string }
  const b = req.body as { batchCode?: string }
  if (!b.batchCode) return reply.code(400).send({ error: 'batchCode required' })
  const batch = await resolveBatch(ctx.projectId, b.batchCode)
  if (!batch) return reply.code(404).send({ error: 'batch not found' })
  const r = await pool.query(`UPDATE lots SET batch_id = $1 WHERE id = $2 AND project_id = $3`, [
    batch.id,
    id,
    ctx.projectId,
  ])
  if (!r.rowCount) return reply.code(404).send({ error: 'lot not found' })
  return { ok: true }
})

/* --------------------------------------------------------------- batches */

app.get('/batches', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { rows } = await pool.query(
    `SELECT b.*, (SELECT count(*)::int FROM samples s WHERE s.batch_id = b.id) AS sample_count
     FROM batches b WHERE b.project_id = $1 ORDER BY b.opened_at DESC`,
    [ctx.projectId]
  )
  return rows.map(shapeBatchRow)
})

app.post('/batches', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const b = req.body as { code?: string; facilityId?: string; notes?: string; gpsLat?: number; gpsLng?: number }
  if (!b.code || !/^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/.test(b.code)) {
    return reply.code(400).send({ error: 'code is required: letters, digits and hyphens, up to 24 characters' })
  }
  if (await resolveBatch(ctx.projectId, b.code)) {
    return reply.code(409).send({ error: 'a batch with this code exists' })
  }
  let gpsLat = b.gpsLat ?? null
  let gpsLng = b.gpsLng ?? null
  if (b.facilityId && gpsLat === null) {
    const f = (
      await pool.query(`SELECT gps_lat, gps_lng FROM facilities WHERE id = $1 AND project_id = $2`, [
        b.facilityId,
        ctx.projectId,
      ])
    ).rows[0]
    if (f) {
      gpsLat = f.gps_lat
      gpsLng = f.gps_lng
    }
  }
  const id = newId('bat')
  await pool.query(
    `INSERT INTO batches (id, project_id, facility_id, code, status, opened_at, gps_lat, gps_lng, notes)
     VALUES ($1, $2, $3, $4, 'open', now(), $5, $6, $7)`,
    [id, ctx.projectId, b.facilityId ?? null, b.code, gpsLat, gpsLng, b.notes ?? '']
  )
  return { id, code: b.code }
})

app.get('/batches/:code', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const b = await resolveBatch(ctx.projectId, code)
  if (!b) return reply.code(404).send({ error: 'not found' })
  const telemetry = (
    await pool.query(`SELECT minute, temp_c FROM telemetry WHERE batch_id = $1 ORDER BY minute`, [b.id])
  ).rows.map((t) => ({ minute: t.minute, tempC: Number(t.temp_c) }))
  const samples = (await pool.query(`SELECT * FROM samples WHERE batch_id = $1 ORDER BY label`, [b.id])).rows
  const certificate = (await pool.query(`SELECT * FROM certificates WHERE batch_id = $1`, [b.id])).rows[0] ?? null
  const coProducts = (
    await pool.query(`SELECT * FROM co_products WHERE batch_id = $1 ORDER BY kind, grade`, [b.id])
  ).rows
  const dispatches = (
    await pool.query(
      `SELECT d.*, (SELECT json_agg(json_build_object('id', a.id, 'farmName', a.farm_name, 'appliedMassKg', a.applied_mass_kg, 'appliedAt', a.applied_at))
                    FROM applications a WHERE a.dispatch_id = d.id) AS applications
       FROM dispatches d WHERE d.batch_id = $1 ORDER BY d.dispatched_at DESC`,
      [b.id]
    )
  ).rows
  const ops = (await pool.query(`SELECT * FROM batch_ops WHERE batch_id = $1`, [b.id])).rows[0] ?? null
  const lots = (await pool.query(`SELECT id, hopper_mass_kg FROM lots WHERE batch_id = $1 ORDER BY id`, [b.id])).rows
  return {
    ...shapeBatchRow({ ...b, sample_count: samples.length }),
    telemetry: { points: telemetry },
    anomalies: findAnomalies(telemetry),
    samples: samples.map((s) => ({ id: s.id, label: s.label, state: s.state, takenAt: s.taken_at, note: s.note })),
    certificate: certificate
      ? {
          id: certificate.id,
          lab: certificate.lab,
          corgFrac: Number(certificate.corg_frac),
          hCorg: Number(certificate.h_corg),
          oCorg: Number(certificate.o_corg),
          moistureFrac: Number(certificate.moisture_frac),
          sourceId: certificate.source_id,
        }
      : null,
    coProducts: coProducts.map((c) => ({
      id: c.id,
      grade: c.grade,
      kind: c.kind,
      massKg: Number(c.mass_kg),
      fate: c.fate,
    })),
    dispatches: dispatches.map((d) => ({
      id: d.id,
      toName: d.to_name,
      massKg: Number(d.mass_kg),
      dispatchedAt: d.dispatched_at,
      applications: d.applications ?? [],
    })),
    ops: ops
      ? {
          transportKm: Number(ops.transport_km),
          transportMassT: Number(ops.transport_mass_t),
          electricityKwh: Number(ops.electricity_kwh),
        }
      : null,
    lots: lots.map((l) => ({ id: l.id, hopperMassKg: Number(l.hopper_mass_kg) })),
  }
})

app.patch('/batches/:code', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const batch = await resolveBatch(ctx.projectId, code)
  if (!batch) return reply.code(404).send({ error: 'not found' })
  const b = req.body as {
    action?: 'close'
    feedstockMassKg?: number
    biocharWetKg?: number
    biocharMoistureFrac?: number
    durationMin?: number
    notes?: string
  }
  if (b.action === 'close') {
    if (typeof b.biocharWetKg !== 'number' || typeof b.biocharMoistureFrac !== 'number') {
      return reply.code(400).send({ error: 'biocharWetKg and biocharMoistureFrac are required to close a batch' })
    }
    const sampleCount = (
      await pool.query(`SELECT count(*)::int AS n FROM samples WHERE batch_id = $1`, [batch.id])
    ).rows[0].n
    await pool.query(
      `UPDATE batches SET status = $1, closed_at = now(), feedstock_mass_kg = $2, biochar_wet_kg = $3,
       biochar_moisture_frac = $4, duration_min = $5 WHERE id = $6`,
      [
        sampleCount > 0 ? 'awaiting-lab' : 'closed',
        b.feedstockMassKg ?? null,
        b.biocharWetKg,
        b.biocharMoistureFrac,
        b.durationMin ?? null,
        batch.id,
      ]
    )
    return { ok: true }
  }
  if (typeof b.notes === 'string') {
    await pool.query(`UPDATE batches SET notes = $1 WHERE id = $2`, [b.notes, batch.id])
    return { ok: true }
  }
  return reply.code(400).send({ error: 'nothing to do' })
})

app.post('/batches/:code/telemetry', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const batch = await resolveBatch(ctx.projectId, code)
  if (!batch) return reply.code(404).send({ error: 'not found' })
  const b = req.body as { csv?: string }
  if (!b.csv) return reply.code(400).send({ error: 'csv body required (minute,temp_c rows)' })
  const rows: [number, number][] = []
  for (const line of b.csv.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || /^[a-z]/i.test(t)) continue
    const [m, temp] = t.split(/[,;\t]/).map(Number)
    if (!Number.isFinite(m) || !Number.isFinite(temp)) {
      return reply.code(400).send({ error: `could not parse line: "${t.slice(0, 40)}"` })
    }
    rows.push([Math.round(m), temp])
  }
  if (rows.length < 10) return reply.code(400).send({ error: 'telemetry needs at least 10 rows' })
  await pool.query(`DELETE FROM telemetry WHERE batch_id = $1`, [batch.id])
  const values = rows.map((r) => `('${batch.id}', ${r[0]}, ${r[1]})`).join(',')
  await pool.query(`INSERT INTO telemetry (batch_id, minute, temp_c) VALUES ${values} ON CONFLICT DO NOTHING`)
  return { rows: rows.length }
})

app.post('/batches/:code/co-products', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const batch = await resolveBatch(ctx.projectId, code)
  if (!batch) return reply.code(404).send({ error: 'not found' })
  const b = req.body as { kind?: string; grade?: string; massKg?: number; fate?: string }
  if (!b.kind || !b.grade || typeof b.massKg !== 'number' || !b.fate) {
    return reply.code(400).send({ error: 'kind, grade, massKg and fate are required' })
  }
  const id = newId('cp')
  await pool.query(
    `INSERT INTO co_products (id, batch_id, kind, grade, mass_kg, fate) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, batch.id, b.kind, b.grade, b.massKg, b.fate]
  )
  return { id }
})

app.post('/batches/:code/samples', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const batch = await resolveBatch(ctx.projectId, code)
  if (!batch) return reply.code(404).send({ error: 'not found' })
  const b = req.body as { notes?: string[] }
  const notes = b.notes && b.notes.length ? b.notes : ['Start of discharge', 'Mid-run discharge', 'End of discharge']
  const existing = (await pool.query(`SELECT count(*)::int AS n FROM samples WHERE batch_id = $1`, [batch.id]))
    .rows[0].n
  const created: string[] = []
  for (let i = 0; i < notes.length; i++) {
    const label = `S-${code}-${existing + i + 1}`
    const id = newId('smp')
    await pool.query(
      `INSERT INTO samples (id, batch_id, label, taken_at, state, note) VALUES ($1, $2, $3, now(), 'registered', $4)`,
      [id, batch.id, label, notes[i]]
    )
    created.push(label)
  }
  if (batch.status === 'closed') {
    await pool.query(`UPDATE batches SET status = 'awaiting-lab' WHERE id = $1`, [batch.id])
  }
  return { created }
})

app.patch('/samples/:id', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { id } = req.params as { id: string }
  const b = req.body as { state?: string }
  if (!b.state) return reply.code(400).send({ error: 'state required' })
  const r = await pool.query(
    `UPDATE samples s SET state = $1 FROM batches bt WHERE s.id = $2 AND bt.id = s.batch_id AND bt.project_id = $3`,
    [b.state, id, ctx.projectId]
  )
  if (!r.rowCount) return reply.code(404).send({ error: 'not found' })
  return { ok: true }
})

app.post('/batches/:code/certificate', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const batch = await resolveBatch(ctx.projectId, code)
  if (!batch) return reply.code(404).send({ error: 'not found' })
  const b = req.body as {
    lab?: string
    corgFrac?: number
    hCorg?: number
    oCorg?: number
    moistureFrac?: number
    sourceId?: string
  }
  if (!b.lab || [b.corgFrac, b.hCorg, b.oCorg, b.moistureFrac].some((v) => typeof v !== 'number')) {
    return reply.code(400).send({ error: 'lab, corgFrac, hCorg, oCorg and moistureFrac are required' })
  }
  await pool.query(`DELETE FROM certificates WHERE batch_id = $1`, [batch.id])
  const id = newId('cert')
  await pool.query(
    `INSERT INTO certificates (id, batch_id, lab, corg_frac, h_corg, o_corg, moisture_frac, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, batch.id, b.lab, b.corgFrac, b.hCorg, b.oCorg, b.moistureFrac, b.sourceId ?? null]
  )
  await pool.query(`UPDATE samples SET state = 'analyzed' WHERE batch_id = $1`, [batch.id])
  await pool.query(`UPDATE batches SET status = 'sampled' WHERE id = $1`, [batch.id])
  return { id }
})

app.put('/batches/:code/ops', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const batch = await resolveBatch(ctx.projectId, code)
  if (!batch) return reply.code(404).send({ error: 'not found' })
  const b = req.body as { transportKm?: number; transportMassT?: number; electricityKwh?: number }
  if ([b.transportKm, b.transportMassT, b.electricityKwh].some((v) => typeof v !== 'number')) {
    return reply.code(400).send({ error: 'transportKm, transportMassT and electricityKwh are required' })
  }
  await pool.query(
    `INSERT INTO batch_ops (batch_id, transport_km, transport_mass_t, electricity_kwh) VALUES ($1, $2, $3, $4)
     ON CONFLICT (batch_id) DO UPDATE SET transport_km = $2, transport_mass_t = $3, electricity_kwh = $4`,
    [batch.id, b.transportKm, b.transportMassT, b.electricityKwh]
  )
  return { ok: true }
})

/* -------------------------------------------------- dispatch and end use */

app.post('/dispatches', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const b = req.body as { batchCode?: string; toName?: string; massKg?: number }
  if (!b.batchCode || !b.toName || typeof b.massKg !== 'number') {
    return reply.code(400).send({ error: 'batchCode, toName and massKg are required' })
  }
  const batch = await resolveBatch(ctx.projectId, b.batchCode)
  if (!batch) return reply.code(404).send({ error: 'batch not found' })
  const id = newId('dsp')
  await pool.query(
    `INSERT INTO dispatches (id, batch_id, to_name, mass_kg, dispatched_at) VALUES ($1, $2, $3, $4, now())`,
    [id, batch.id, b.toName, b.massKg]
  )
  return { id }
})

app.post('/applications', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const b = req.body as {
    dispatchId?: string
    farmName?: string
    areaHa?: number
    appliedMassKg?: number
    sourceId?: string
  }
  if (!b.dispatchId || !b.farmName || typeof b.areaHa !== 'number' || typeof b.appliedMassKg !== 'number') {
    return reply.code(400).send({ error: 'dispatchId, farmName, areaHa and appliedMassKg are required' })
  }
  const id = newId('app')
  await pool.query(
    `INSERT INTO applications (id, project_id, dispatch_id, farm_name, area_ha, applied_mass_kg, applied_at, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, now(), $7)`,
    [id, ctx.projectId, b.dispatchId, b.farmName, b.areaHa, b.appliedMassKg, b.sourceId ?? null]
  )
  return { id }
})

/* ---------------------------------------------------- evidence and files */

app.post('/sources/upload', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  await mkdir(FILES_DIR, { recursive: true })
  let kind = 'evidence'
  let title = ''
  let note: string | null = null
  let saved: { path: string; sha256: string; mime: string; size: number } | null = null
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const tmp = path.join(FILES_DIR, `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      const hash = createHash('sha256')
      let size = 0
      const sink = createWriteStream(tmp)
      for await (const chunk of part.file) {
        hash.update(chunk as Buffer)
        size += (chunk as Buffer).length
        sink.write(chunk)
      }
      await new Promise((res) => sink.end(res))
      const sha256 = hash.digest('hex')
      const ext = path.extname(part.filename ?? '').slice(0, 10) || '.bin'
      const finalPath = path.join(FILES_DIR, `${sha256}${ext}`)
      await rename(tmp, finalPath)
      saved = { path: finalPath, sha256, mime: part.mimetype, size }
      if (!title) title = part.filename ?? 'Uploaded file'
    } else if (part.fieldname === 'kind') kind = String(part.value)
    else if (part.fieldname === 'title') title = String(part.value)
    else if (part.fieldname === 'note') note = String(part.value)
  }
  if (!saved) return reply.code(400).send({ error: 'no file in upload' })
  const id = newId('src')
  await pool.query(
    `INSERT INTO sources (id, project_id, kind, title, note, file_path, file_sha256, mime, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, ctx.projectId, kind, title, note, saved.path, saved.sha256, saved.mime, saved.size]
  )
  return { id, sha256: saved.sha256 }
})

app.get('/sources/:id', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { id } = req.params as { id: string }
  if (id === 'project-profile') {
    const p = (await pool.query(`SELECT * FROM projects WHERE id = $1`, [ctx.projectId])).rows[0]
    return { id, kind: 'reference', title: p.t_soil_source, ref: null, note: 'Project profile value', hasFile: false }
  }
  const s = (
    await pool.query(`SELECT * FROM sources WHERE id = $1 AND (project_id = $2 OR project_id IS NULL)`, [
      id,
      ctx.projectId,
    ])
  ).rows[0]
  if (!s) return reply.code(404).send({ error: 'not found' })
  return {
    id: s.id,
    kind: s.kind,
    title: s.title,
    ref: s.ref,
    note: s.note,
    hasFile: Boolean(s.file_path),
    mime: s.mime,
    sizeBytes: s.size_bytes === null ? null : Number(s.size_bytes),
    sha256: s.file_sha256,
  }
})

app.get('/sources/:id/file', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { id } = req.params as { id: string }
  const s = (await pool.query(`SELECT * FROM sources WHERE id = $1 AND project_id = $2`, [id, ctx.projectId])).rows[0]
  if (!s?.file_path) return reply.code(404).send({ error: 'no file' })
  try {
    await stat(s.file_path)
  } catch {
    return reply.code(404).send({ error: 'file missing on disk' })
  }
  reply.header('content-type', s.mime ?? 'application/octet-stream')
  return reply.send(createReadStream(s.file_path))
})

/* ------------------------------------------------ compliance and certify */

app.get('/compliance', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  return buildCompliance(ctx.projectId)
})

app.get('/chain/verify', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  return verifyChain(ctx.projectId)
})

app.get('/batches/:code/ledger', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const bundle = await buildLedger(ctx.projectId, code)
  if (!bundle) return reply.code(404).send({ error: 'no ledger: batch missing, open, or lacking a certificate' })
  return bundle
})

app.get('/batches/:code/sensor-export', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const { format } = req.query as { format?: string }
  const batch = await resolveBatch(ctx.projectId, code)
  if (!batch) return reply.code(404).send({ error: 'not found' })
  const points = (
    await pool.query(`SELECT minute, temp_c FROM telemetry WHERE batch_id = $1 ORDER BY minute`, [batch.id])
  ).rows.map((t) => ({ minute: t.minute, tempC: Number(t.temp_c) }))
  if (!points.length) return reply.code(404).send({ error: 'no telemetry on this batch' })
  const buckets = aggregateSensorSeries(`${code}-reactor-temp`, new Date(batch.opened_at), points)
  if (format === 'parquet') {
    const col = <T>(f: (b: (typeof buckets)[0]) => T) => buckets.map(f)
    const buf = parquetWriteBuffer({
      columnData: [
        { name: 'aggregation_period_start_timestamp', data: col((b) => b.aggregation_period_start_timestamp), type: 'STRING' },
        { name: 'aggregation_period_end_timestamp', data: col((b) => b.aggregation_period_end_timestamp), type: 'STRING' },
        { name: 'sensor_reference', data: col((b) => b.sensor_reference), type: 'STRING' },
        { name: 'minimum', data: col((b) => b.minimum), type: 'DOUBLE' },
        { name: 'maximum', data: col((b) => b.maximum), type: 'DOUBLE' },
        { name: 'mean', data: col((b) => b.mean), type: 'DOUBLE' },
        { name: 'median', data: col((b) => b.median), type: 'DOUBLE' },
        { name: 'count', data: col((b) => BigInt(b.count)), type: 'INT64' },
        { name: 'standard_deviation', data: col((b) => b.standard_deviation), type: 'DOUBLE' },
        { name: 'first_timestamp', data: col((b) => b.first_timestamp), type: 'STRING' },
        { name: 'last_timestamp', data: col((b) => b.last_timestamp), type: 'STRING' },
      ],
    })
    reply.header('content-type', 'application/vnd.apache.parquet')
    reply.header('content-disposition', `attachment; filename="${code}-sensor.parquet"`)
    return reply.send(Buffer.from(buf))
  }
  return { sensorReference: `${code}-reactor-temp`, aggregationSeconds: 60, buckets }
})

app.post('/certify/preview/:code', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const payload = await buildCertifyPayload(ctx.projectId, code)
  if (!payload) return reply.code(404).send({ error: 'batch not ready for a statement' })
  const cfg = certifyConfig()
  return { ...payload, mode: cfg.mode, config: cfg.detail }
})

app.post('/certify/submit/:code', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { code } = req.params as { code: string }
  const payload = await buildCertifyPayload(ctx.projectId, code)
  if (!payload) return reply.code(404).send({ error: 'batch not ready for a statement' })
  const hash = createHash('sha256').update(JSON.stringify(payload.payload)).digest('hex')
  const result = await certifySubmit(payload.payload)
  const row = (
    await pool.query(
      `INSERT INTO certify_submissions (project_id, batch_code, payload_hash, mode) VALUES ($1, $2, $3, $4) RETURNING *`,
      [ctx.projectId, code, hash, result.mode]
    )
  ).rows[0]
  return {
    id: row.id,
    batchId: code,
    payloadHash: hash,
    mode: result.mode,
    upstreamStatus: result.status,
    createdAt: row.created_at,
  }
})

app.get('/certify/submissions', async (req, reply) => {
  const ctx = await requireProject(req, reply)
  if (!ctx) return
  const { rows } = await pool.query(
    `SELECT * FROM certify_submissions WHERE project_id = $1 ORDER BY created_at DESC`,
    [ctx.projectId]
  )
  return rows.map((r) => ({
    id: r.id,
    batchId: r.batch_code,
    payloadHash: r.payload_hash,
    mode: r.mode,
    createdAt: r.created_at,
  }))
})

/* ---------------------------------------------------------------- shapes */

async function projectSummary(projectId: string) {
  const project = (await pool.query(`SELECT * FROM projects WHERE id = $1`, [projectId])).rows[0]
  if (!project) return null
  const counts = (
    await pool.query(
      `SELECT (SELECT count(*)::int FROM suppliers WHERE project_id = $1) AS suppliers,
              (SELECT count(*)::int FROM consignments WHERE project_id = $1) AS consignments,
              (SELECT count(*)::int FROM batches WHERE project_id = $1) AS batches,
              (SELECT count(*)::int FROM batches WHERE project_id = $1 AND status = 'sampled') AS sampled,
              (SELECT count(*)::int FROM facilities WHERE project_id = $1) AS facilities`,
      [projectId]
    )
  ).rows[0]
  let tonnesConservative = 0
  const sampled = (
    await pool.query(`SELECT code FROM batches WHERE project_id = $1 AND status = 'sampled'`, [projectId])
  ).rows
  for (const b of sampled) {
    const bundle = await buildLedger(projectId, b.code)
    if (bundle?.result.gatePass) tonnesConservative += bundle.result.netConservativeT
  }
  return {
    id: project.id,
    name: project.name,
    district: project.district,
    synthetic: project.synthetic,
    tSoilC: Number(project.t_soil_c),
    suppliers: counts.suppliers,
    consignments: counts.consignments,
    batches: counts.batches,
    sampledBatches: counts.sampled,
    facilities: counts.facilities,
    tonnesConservative,
    updatedAt: new Date().toISOString(),
  }
}

function shapeBatchRow(b: Record<string, unknown>) {
  const openedAt = new Date(b.opened_at as string)
  const closedAt = b.closed_at ? new Date(b.closed_at as string) : null
  return {
    id: b.code,
    status: b.status,
    openedAt,
    closedAt,
    ageDays: Math.round(((closedAt?.getTime() ?? Date.now()) - openedAt.getTime()) / 86400000),
    feedstockMassKg: b.feedstock_mass_kg === null ? null : Number(b.feedstock_mass_kg),
    biocharWetKg: b.biochar_wet_kg === null ? null : Number(b.biochar_wet_kg),
    biocharMoistureFrac: b.biochar_moisture_frac === null ? null : Number(b.biochar_moisture_frac),
    durationMin: b.duration_min,
    gps: b.gps_lat === null ? null : { lat: Number(b.gps_lat), lng: Number(b.gps_lng) },
    notes: b.notes,
    sampleCount: (b.sample_count as number) ?? 0,
  }
}

/** Wait for Postgres for up to 30 s, so the API can start alongside it. */
async function waitForDb(): Promise<void> {
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (err) {
      // Retry only while Postgres is still starting; a wrong password or
      // database name will not fix itself.
      const code = (err as { code?: string }).code
      const starting = code === 'ECONNREFUSED' || code === '57P03' || code === 'ENOTFOUND'
      if (!starting || Date.now() > deadline) throw err
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

const port = Number(process.env.PORT ?? 8080)
waitForDb()
  .then(() => migrate())
  .then(() => loadExtensions(app))
  .then(() => {
    startMqttIngest()
    return app.listen({ port, host: '0.0.0.0' })
  })
  .then(() => console.log(`openchar-api on :${port}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
