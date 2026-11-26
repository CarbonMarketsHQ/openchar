/**
 * Soil application captured in the field: where the biochar went into the
 * ground (a GPS point and the field boundary walked on foot), photos, a short
 * video, and the farmer's signed declaration. The field app holds it offline
 * and syncs it as one `application-captured` event.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { pool } from './db.js'

type Point = [number, number]

/** Area of a lat/lng ring in hectares, on a local flat projection (fine at field scale). */
export function ringAreaHa(ring: Point[]): number {
  if (ring.length < 3) return 0
  const lat0 = (ring.reduce((n, p) => n + p[0], 0) / ring.length) * (Math.PI / 180)
  const R = 6371008.8
  const xy = ring.map(([lat, lng]) => [((lng * Math.PI) / 180) * R * Math.cos(lat0), ((lat * Math.PI) / 180) * R])
  let a = 0
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i]
    const [x2, y2] = xy[(i + 1) % xy.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2 / 10000
}

export type ApplicationPayload = {
  applicationId: string
  dispatchId: string
  farmName: string
  appliedMassKg: number
  areaHa?: number | null
  gps?: { lat: number; lng: number } | null
  boundary?: Point[] | null
  photoRefs?: string[]
  videoRef?: string | null
  declaration?: { name: string; statement: string; signedAt: string; signatureRef: string | null } | null
}

/** Called from /sync for each `application-captured` event. Returns an error
 * string for a payload that cannot be recorded, so the field app can show it. */
export async function recordFieldApplication(projectId: string, capturedAt: string, p: ApplicationPayload): Promise<string | null> {
  const d = (
    await pool.query(`SELECT d.id FROM dispatches d JOIN batches b ON b.id = d.batch_id WHERE d.id = $1 AND b.project_id = $2`, [p.dispatchId, projectId])
  ).rows[0]
  if (!d) return `dispatch ${p.dispatchId} is not in this project`
  if (!p.farmName?.trim() || !(Number(p.appliedMassKg) > 0)) return 'farm name and applied mass are required'
  const boundary = Array.isArray(p.boundary) && p.boundary.length >= 3 ? p.boundary : null
  const area = boundary ? Math.round(ringAreaHa(boundary) * 1000) / 1000 : Number(p.areaHa)
  if (!(area > 0)) return 'walk the field boundary or give its area'
  const polygon = boundary
    ? { type: 'Polygon', coordinates: [[...boundary.map(([lat, lng]) => [lng, lat]), [boundary[0][1], boundary[0][0]]]], walked: true }
    : null
  await pool.query(
    `INSERT INTO applications (id, project_id, dispatch_id, farm_name, area_ha, polygon, applied_mass_kg, applied_at,
                               gps_lat, gps_lng, photo_refs, video_ref, declaration)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
    [
      p.applicationId,
      projectId,
      p.dispatchId,
      p.farmName.trim().slice(0, 160),
      area,
      polygon ? JSON.stringify(polygon) : null,
      Number(p.appliedMassKg),
      capturedAt,
      p.gps?.lat ?? null,
      p.gps?.lng ?? null,
      JSON.stringify(p.photoRefs ?? []),
      p.videoRef ?? null,
      p.declaration ? JSON.stringify(p.declaration) : null,
    ]
  )
  return null
}

export function registerApplicationRoutes(app: FastifyInstance): void {
  /** Dispatches still waiting for application evidence, for the field app's list. */
  app.get('/dispatches/open', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { rows } = await pool.query(
      `SELECT d.id, d.to_name, d.mass_kg, d.dispatched_at, b.code,
              COALESCE((SELECT SUM(a.applied_mass_kg) FROM applications a WHERE a.dispatch_id = d.id), 0) AS applied
       FROM dispatches d JOIN batches b ON b.id = d.batch_id
       WHERE b.project_id = $1 ORDER BY d.dispatched_at DESC`,
      [ctx.projectId]
    )
    return rows
      .filter((d) => Number(d.applied) < Number(d.mass_kg))
      .map((d) => ({
        id: d.id as string,
        toName: d.to_name as string,
        batch: d.code as string,
        massKg: Number(d.mass_kg),
        leftKg: Number(d.mass_kg) - Number(d.applied),
        dispatchedAt: d.dispatched_at,
      }))
  })
}
