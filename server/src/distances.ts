/**
 * Road distances. Feedstock collection (supplier to plant) and biochar
 * delivery (plant to buyer or farm) are kept apart. Without a recorded
 * distance, the estimate is the straight-line distance between the two sets
 * of coordinates times a road factor of 1.3, and it is labelled an estimate
 * wherever it is shown. A recorded distance (odometer or route) replaces it.
 * Nothing here changes the ledger by itself: a person applies the delivery
 * figure to a batch's run inputs.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { pool } from './db.js'
import { resolveBatch } from './report.js'

export const ROAD_FACTOR = 1.3

type Point = { lat: number; lng: number }

export function straightKm(a: Point, b: Point): number {
  const R = 6371.0088
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const roadEstimateKm = (a: Point, b: Point) => Math.round(straightKm(a, b) * ROAD_FACTOR * 10) / 10

const point = (lat: unknown, lng: unknown): Point | null =>
  lat === null || lat === undefined || lng === null || lng === undefined ? null : { lat: Number(lat), lng: Number(lng) }

export type Distance = { km: number | null; source: 'recorded' | 'estimate' | null }

/** A recorded distance wins; otherwise the estimate when both ends have coordinates. */
export function distanceFor(recordedKm: unknown, from: Point | null, to: Point | null): Distance {
  if (recordedKm !== null && recordedKm !== undefined) return { km: Number(recordedKm), source: 'recorded' }
  if (from && to) return { km: roadEstimateKm(from, to), source: 'estimate' }
  return { km: null, source: null }
}

export async function plantPoint(projectId: string, facilityId?: string | null): Promise<Point | null> {
  const { rows } = await pool.query(
    `SELECT gps_lat, gps_lng FROM facilities WHERE project_id = $1 AND ($2::text IS NULL OR id = $2) ORDER BY created_at LIMIT 1`,
    [projectId, facilityId ?? null]
  )
  return rows[0] ? point(rows[0].gps_lat, rows[0].gps_lng) : null
}

const weightedMean = (items: { km: number; massKg: number }[]) => {
  const mass = items.reduce((n, i) => n + i.massKg, 0)
  return mass > 0 ? Math.round((items.reduce((n, i) => n + i.km * i.massKg, 0) / mass) * 10) / 10 : null
}

export function registerDistanceRoutes(app: FastifyInstance): void {
  /** Record a consignment's actual road distance, from an odometer or a route. */
  app.patch('/consignments/:id/distance', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const km = Number((req.body as { km?: number | string })?.km)
    if (!Number.isFinite(km) || km < 0 || km > 2000) return reply.code(400).send({ error: 'Give the distance in km, between 0 and 2000.' })
    const r = await pool.query(`UPDATE consignments SET distance_km = $1 WHERE id = $2 AND project_id = $3`, [km, id, ctx.projectId])
    if (!r.rowCount) return reply.code(404).send({ error: 'No such consignment in this project.' })
    return { ok: true }
  })

  app.patch('/dispatches/:id/distance', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as { km?: number | string; destLat?: number | string; destLng?: number | string }
    const km = b.km === undefined || b.km === '' ? null : Number(b.km)
    const lat = b.destLat === undefined || b.destLat === '' ? null : Number(b.destLat)
    const lng = b.destLng === undefined || b.destLng === '' ? null : Number(b.destLng)
    if (km !== null && (!Number.isFinite(km) || km < 0 || km > 5000)) return reply.code(400).send({ error: 'Give the distance in km, between 0 and 5000.' })
    if ((lat === null) !== (lng === null) || (lat !== null && (Math.abs(lat) > 90 || Math.abs(lng!) > 180))) {
      return reply.code(400).send({ error: 'Give both latitude and longitude, in decimal degrees.' })
    }
    const r = await pool.query(
      `UPDATE dispatches d SET distance_km = $1, dest_lat = $2, dest_lng = $3
       FROM batches b WHERE d.id = $4 AND b.id = d.batch_id AND b.project_id = $5`,
      [km, lat, lng, id, ctx.projectId]
    )
    if (!r.rowCount) return reply.code(404).send({ error: 'No such dispatch in this project.' })
    return { ok: true }
  })

  /** Collection and delivery distances for one batch, side by side with
   * the run inputs the ledger uses today. */
  app.get('/batches/:code/transport', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { code } = req.params as { code: string }
    const batch = await resolveBatch(ctx.projectId, code)
    if (!batch) return reply.code(404).send({ error: 'batch not found' })
    const plant = await plantPoint(ctx.projectId, batch.facility_id)

    const cons = (
      await pool.query(
        `SELECT c.id, c.est_mass_kg, c.distance_km, s.name AS supplier, s.lat, s.lng
         FROM consignments c JOIN lots l ON l.id = c.lot_id JOIN suppliers s ON s.id = c.supplier_id
         WHERE l.batch_id = $1 ORDER BY c.id`,
        [batch.id]
      )
    ).rows.map((c) => ({
      id: c.id as string,
      supplier: c.supplier as string,
      massKg: Number(c.est_mass_kg),
      ...distanceFor(c.distance_km, point(c.lat, c.lng), plant),
    }))
    const disp = (
      await pool.query(`SELECT id, to_name, mass_kg, distance_km, dest_lat, dest_lng FROM dispatches WHERE batch_id = $1 ORDER BY dispatched_at`, [
        batch.id,
      ])
    ).rows.map((d) => ({
      id: d.id as string,
      toName: d.to_name as string,
      massKg: Number(d.mass_kg),
      ...distanceFor(d.distance_km, plant, point(d.dest_lat, d.dest_lng)),
    }))
    const ops = (await pool.query(`SELECT transport_km, transport_mass_t FROM batch_ops WHERE batch_id = $1`, [batch.id])).rows[0]
    const known = <T extends { km: number | null }>(xs: T[]) => xs.filter((x): x is T & { km: number } => x.km !== null)
    const sum = (xs: { km: number; massKg: number }[]) => Math.round(xs.reduce((n, x) => n + (x.km * x.massKg) / 1000, 0) * 10) / 10
    return {
      roadFactor: ROAD_FACTOR,
      plantHasCoordinates: Boolean(plant),
      collection: { items: cons, meanKm: weightedMean(known(cons)), tonneKm: sum(known(cons)), missing: cons.filter((c) => c.km === null).map((c) => c.id) },
      delivery: {
        items: disp,
        meanKm: weightedMean(known(disp)),
        tonneKm: sum(known(disp)),
        massT: Math.round(known(disp).reduce((n, d) => n + d.massKg, 0)) / 1000,
        missing: disp.filter((d) => d.km === null).map((d) => d.id),
      },
      ledger: ops ? { transportKm: Number(ops.transport_km), transportMassT: Number(ops.transport_mass_t) } : null,
    }
  })

  /** Put the delivery distances into the batch's run inputs, which the
   * ledger's transport line reads. A person asks for this; it never happens
   * on its own. */
  app.post('/batches/:code/transport/apply', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { code } = req.params as { code: string }
    const batch = await resolveBatch(ctx.projectId, code)
    if (!batch) return reply.code(404).send({ error: 'batch not found' })
    const plant = await plantPoint(ctx.projectId, batch.facility_id)
    const disp = (await pool.query(`SELECT mass_kg, distance_km, dest_lat, dest_lng FROM dispatches WHERE batch_id = $1`, [batch.id])).rows
      .map((d) => ({ massKg: Number(d.mass_kg), ...distanceFor(d.distance_km, plant, point(d.dest_lat, d.dest_lng)) }))
    if (!disp.length || disp.some((d) => d.km === null)) {
      return reply.code(400).send({ error: 'Every dispatch needs a distance or destination coordinates first.' })
    }
    const known = disp as { km: number; massKg: number }[]
    const km = weightedMean(known)!
    const massT = known.reduce((n, d) => n + d.massKg, 0) / 1000
    const ops = (await pool.query(`SELECT 1 FROM batch_ops WHERE batch_id = $1`, [batch.id])).rows[0]
    if (!ops) return reply.code(400).send({ error: 'Enter the run inputs for this batch first.' })
    await pool.query(`UPDATE batch_ops SET transport_km = $1, transport_mass_t = $2 WHERE batch_id = $3`, [km, massT, batch.id])
    return { transportKm: km, transportMassT: massT }
  })
}
