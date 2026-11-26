/**
 * Documents by type (supplier declarations, land records, invoices,
 * weighbridge slips and the rest), each attachable to the consignments,
 * lots, batches and facilities it is evidence for. A document is a row in `sources`,
 * the same table the ledger cites, so an uploaded slip or certificate is
 * one click from any number that used it.
 */
import type { FastifyInstance } from 'fastify'
import { requireProject } from './auth.js'
import { newId, pool } from './db.js'
import { saveUpload } from './files.js'

export const DOC_TYPES = [
  'supplier-declaration',
  'land-record',
  'invoice',
  'weighbridge-slip',
  'lab-certificate',
  'calibration',
  'permit',
  'other',
] as const

export const RECORD_KINDS = ['consignment', 'lot', 'batch', 'facility'] as const
type RecordKind = (typeof RECORD_KINDS)[number]

/** The record's canonical id within the project, or null when it is not
 * this project's. Batches are addressed by their code, as everywhere else. */
async function resolveRecord(projectId: string, kind: string, id: string): Promise<string | null> {
  if (!RECORD_KINDS.includes(kind as RecordKind) || !id) return null
  const sql = {
    consignment: `SELECT id FROM consignments WHERE project_id = $1 AND id = $2`,
    lot: `SELECT id FROM lots WHERE project_id = $1 AND id = $2`,
    batch: `SELECT code AS id FROM batches WHERE project_id = $1 AND code = $2`,
    facility: `SELECT id FROM facilities WHERE project_id = $1 AND id = $2`,
  }[kind as RecordKind]
  const { rows } = await pool.query(sql, [projectId, id])
  return rows[0]?.id ?? null
}

type Link = { kind: RecordKind; id: string; label: string }

/** Every link for the project's documents: the explicit ones, plus the ones
 * the records already imply (a lot's weighbridge slip, a batch's lab
 * certificate). */
export async function allLinks(projectId: string): Promise<Map<string, Link[]>> {
  const { rows } = await pool.query(
    `SELECT source_id, record_kind AS kind, record_id AS id FROM source_links WHERE project_id = $1
     UNION
     SELECT slip_source_id, 'lot', id FROM lots WHERE project_id = $1 AND slip_source_id IS NOT NULL
     UNION
     SELECT c.source_id, 'batch', b.code FROM certificates c JOIN batches b ON b.id = c.batch_id
       WHERE b.project_id = $1 AND c.source_id IS NOT NULL
     ORDER BY 2, 3`,
    [projectId]
  )
  // Facilities read by name; every other record by its id.
  const names = new Map<string, string>(
    (await pool.query(`SELECT id, name FROM facilities WHERE project_id = $1`, [projectId])).rows.map((f) => [f.id, f.name])
  )
  const out = new Map<string, Link[]>()
  for (const r of rows) {
    const list = out.get(r.source_id) ?? []
    list.push({ kind: r.kind, id: r.id, label: (r.kind === 'facility' && names.get(r.id)) || r.id })
    out.set(r.source_id, list)
  }
  return out
}

function shape(s: Record<string, unknown>, links: Link[]) {
  return {
    id: s.id as string,
    type: s.kind as string,
    title: s.title as string,
    note: (s.note as string | null) ?? null,
    hasFile: Boolean(s.file_path),
    mime: (s.mime as string | null) ?? null,
    sizeBytes: s.size_bytes === null || s.size_bytes === undefined ? null : Number(s.size_bytes),
    sha256: (s.file_sha256 as string | null) ?? null,
    createdAt: s.created_at as string,
    links,
  }
}

export function registerDocumentRoutes(app: FastifyInstance): void {
  /** Documents of the known types, newest first, optionally filtered by
   * type or by the record they are attached to (?record=batch:HT-02). */
  app.get('/documents', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const q = req.query as { type?: string; record?: string }
    const { rows } = await pool.query(
      `SELECT * FROM sources WHERE project_id = $1 AND kind = ANY($2) ORDER BY created_at DESC, id`,
      [ctx.projectId, q.type && DOC_TYPES.includes(q.type as never) ? [q.type] : [...DOC_TYPES]]
    )
    const links = await allLinks(ctx.projectId)
    let docs = rows.map((r) => shape(r, links.get(r.id) ?? []))
    if (q.record) {
      const [kind, ...rest] = q.record.split(':')
      const id = rest.join(':')
      docs = docs.filter((d) => d.links.some((l) => l.kind === kind && l.id === id))
    }
    return { types: DOC_TYPES, documents: docs }
  })

  /** Upload one document: multipart with `file`, `type`, optional `title`,
   * `note`, and an optional record to attach it to (`recordKind`, `recordId`). */
  app.post('/documents', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { fields, file } = await saveUpload(req)
    if (!file) return reply.code(400).send({ error: 'Choose a file to upload.' })
    const type = fields.type ?? ''
    if (!DOC_TYPES.includes(type as never)) {
      return reply.code(400).send({ error: `Unknown document type. Use one of: ${DOC_TYPES.join(', ')}.` })
    }
    let record: Link | null = null
    if (fields.recordKind || fields.recordId) {
      const id = await resolveRecord(ctx.projectId, fields.recordKind ?? '', fields.recordId ?? '')
      if (!id) return reply.code(404).send({ error: 'That record is not in this project.' })
      record = { kind: fields.recordKind as RecordKind, id, label: id }
    }
    const id = newId('src')
    const title = (fields.title ?? '').trim() || file.filename || 'Uploaded document'
    await pool.query(
      `INSERT INTO sources (id, project_id, kind, title, note, file_path, file_sha256, mime, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, ctx.projectId, type, title.slice(0, 200), fields.note?.trim() || null, file.path, file.sha256, file.mime, file.size]
    )
    if (record) {
      await pool.query(
        `INSERT INTO source_links (source_id, project_id, record_kind, record_id) VALUES ($1, $2, $3, $4)`,
        [id, ctx.projectId, record.kind, record.id]
      )
    }
    return { id, sha256: file.sha256 }
  })

  /** Attach an existing document to another record. */
  app.post('/documents/:id/links', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as { kind?: string; id?: string }
    const doc = await pool.query(`SELECT 1 FROM sources WHERE id = $1 AND project_id = $2`, [id, ctx.projectId])
    if (!doc.rows.length) return reply.code(404).send({ error: 'No such document in this project.' })
    const recordId = await resolveRecord(ctx.projectId, b.kind ?? '', b.id ?? '')
    if (!recordId) return reply.code(404).send({ error: 'That record is not in this project.' })
    await pool.query(
      `INSERT INTO source_links (source_id, project_id, record_kind, record_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [id, ctx.projectId, b.kind, recordId]
    )
    return { ok: true }
  })

  app.delete('/documents/:id/links/:kind/:recordId', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const { id, kind, recordId } = req.params as { id: string; kind: string; recordId: string }
    const r = await pool.query(
      `DELETE FROM source_links WHERE source_id = $1 AND project_id = $2 AND record_kind = $3 AND record_id = $4`,
      [id, ctx.projectId, kind, recordId]
    )
    if (!r.rowCount) return reply.code(404).send({ error: 'No such link.' })
    return { ok: true }
  })
}
