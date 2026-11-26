/**
 * A full copy of a workspace, and the import that loads it into another
 * OpenChar server. The archive holds every table the workspace owns (as JSON
 * for import and CSV for spreadsheets) and every uploaded file. Sessions,
 * password hashes, reset tokens and the sign-in log stay behind: they are
 * credentials, not records.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8, unzipSync } from 'fflate'
import type { FastifyInstance } from 'fastify'
import type { PoolClient } from 'pg'
import { logAuthEvent, requireProject, type SessionUser } from './auth.js'
import { pool, verifyChain } from './db.js'
import { FILES_DIR } from './files.js'

export const FORMAT = 'openchar-workspace'
export const FORMAT_VERSION = 1

const P = `(SELECT id FROM projects WHERE workspace_id = $1)`
const B = `(SELECT id FROM batches WHERE project_id IN ${P})`
const U = `(SELECT id FROM units WHERE project_id IN ${P})`

/** Every table a workspace owns, in an order that satisfies the foreign keys
 * on import. `serial` tables get fresh ids on import. */
export const EXPORT_TABLES: { name: string; where: string; columns?: string; serial?: boolean }[] = [
  { name: 'workspaces', where: `id = $1` },
  // No password hashes: people set a new password on the server they move to.
  { name: 'users', where: `workspace_id = $1`, columns: 'id, workspace_id, email, name, role, created_at' },
  { name: 'projects', where: `workspace_id = $1` },
  { name: 'facilities', where: `project_id IN ${P}` },
  { name: 'suppliers', where: `project_id IN ${P}` },
  { name: 'sources', where: `project_id IN ${P}` },
  { name: 'field_events', where: `project_id IN ${P}` },
  { name: 'batches', where: `project_id IN ${P}` },
  { name: 'lots', where: `project_id IN ${P}` },
  { name: 'consignments', where: `project_id IN ${P}` },
  { name: 'telemetry', where: `batch_id IN ${B}` },
  { name: 'co_products', where: `batch_id IN ${B}` },
  { name: 'samples', where: `batch_id IN ${B}` },
  { name: 'certificates', where: `batch_id IN ${B}` },
  { name: 'batch_ops', where: `batch_id IN ${B}` },
  { name: 'dispatches', where: `batch_id IN ${B}` },
  { name: 'applications', where: `project_id IN ${P}` },
  { name: 'units', where: `project_id IN ${P}` },
  { name: 'unit_parents', where: `unit_id IN ${U}` },
  { name: 'unit_events', where: `unit_id IN ${U}`, serial: true },
  { name: 'certify_submissions', where: `project_id IN ${P}`, serial: true },
  { name: 'source_links', where: `project_id IN ${P}` },
  { name: 'shifts', where: `project_id IN ${P}` },
  { name: 'downtime', where: `project_id IN ${P}` },
]

/** Tables that are deliberately not part of a workspace copy. */
export const NOT_EXPORTED: Record<string, string> = {
  sessions: 'sign-in tokens',
  password_resets: 'reset tokens',
  auth_events: 'the sign-in log of this server',
  backup_runs: 'this server’s backup history',
  cloud_signup_codes: 'hosted-service sign-up codes',
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.join(',')]
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','))
  return lines.join('\n') + '\n'
}

async function tableColumns(name: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [name]
  )
  return rows.map((r) => r.column_name as string)
}

/** Stream the workspace archive. Postgres writes the JSON itself, so dates,
 * timestamps and numbers keep their database form. */
export async function streamWorkspaceArchive(workspaceId: string): Promise<{ stream: PassThrough; filename: string }> {
  const ws = (await pool.query(`SELECT id, name FROM workspaces WHERE id = $1`, [workspaceId])).rows[0]
  if (!ws) throw new Error('workspace not found')
  const out = new PassThrough()
  const zip = new Zip((err, chunk, final) => {
    if (err) return out.destroy(err)
    out.write(Buffer.from(chunk))
    if (final) out.end()
  })
  const addText = (name: string, text: string) => {
    const f = new ZipDeflate(name, { level: 6 })
    zip.add(f)
    f.push(strToU8(text), true)
  }

  const counts: Record<string, number> = {}
  const tableData: { name: string; json: string; csv: string }[] = []
  let sources: Record<string, unknown>[] = []
  for (const t of EXPORT_TABLES) {
    const cols = await tableColumns(t.name)
    if (cols.length === 0) continue
    const select = t.columns ?? '*'
    const { rows } = await pool.query(
      `SELECT coalesce(json_agg(t ORDER BY t.${cols[0]}), '[]'::json)::text AS j
       FROM (SELECT ${select} FROM ${t.name} WHERE ${t.where}) t`,
      [workspaceId]
    )
    const json = rows[0].j as string
    const parsed = JSON.parse(json) as Record<string, unknown>[]
    counts[t.name] = parsed.length
    const csvCols = t.columns ? t.columns.split(',').map((c) => c.trim()) : cols
    tableData.push({ name: t.name, json, csv: toCsv(parsed, csvCols) })
    if (t.name === 'sources') sources = parsed
  }

  const files: { path: string; sha256: string; size: number }[] = []
  const onDisk: { entry: string; disk: string }[] = []
  const seen = new Set<string>()
  for (const s of sources) {
    const p = s.file_path as string | null
    const sha = s.file_sha256 as string | null
    if (!p || !sha || seen.has(sha)) continue
    const size = await stat(p).then((x) => x.size).catch(() => null)
    if (size === null) continue
    seen.add(sha)
    files.push({ path: `files/${path.basename(p)}`, sha256: sha, size })
    onDisk.push({ entry: `files/${path.basename(p)}`, disk: p })
  }

  const exportedAt = new Date().toISOString()
  const manifest = {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt,
    workspace: { id: ws.id, name: ws.name },
    tables: counts,
    files,
    notExported: NOT_EXPORTED,
  }
  addText('manifest.json', JSON.stringify(manifest, null, 2) + '\n')
  addText(
    'README.txt',
    [
      `OpenChar workspace copy: ${ws.name}`,
      `Exported ${exportedAt}`,
      '',
      'data/   one JSON file per table, used to import this copy into another OpenChar server',
      'csv/    the same tables as CSV, for spreadsheets',
      'files/  every uploaded document and photo, named by its SHA-256 hash',
      '',
      'To load this copy into your own server:',
      '  npm run admin -w server -- import-workspace <this file>',
      'See docs/self-hosting.md in https://github.com/CarbonMarketsHQ/openchar',
      '',
      'Passwords are not included. After an import, each person sets a new one',
      'from a reset link: npm run admin -w server -- reset-link <email>',
      '',
    ].join('\n')
  )
  for (const t of tableData) {
    addText(`data/${t.name}.json`, t.json + '\n')
    addText(`csv/${t.name}.csv`, t.csv)
  }

  // Files go last and stream from disk, so large photo sets never sit in memory.
  void (async () => {
    try {
      for (const f of onDisk) {
        const entry = new ZipPassThrough(f.entry)
        zip.add(entry)
        for await (const chunk of createReadStream(f.disk)) entry.push(new Uint8Array(chunk as Buffer))
        entry.push(new Uint8Array(0), true)
      }
      zip.end()
    } catch (e) {
      out.destroy(e as Error)
    }
  })()

  const slug = String(ws.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
  return { stream: out, filename: `openchar-${slug}-${exportedAt.slice(0, 10)}.zip` }
}

export function registerExportRoutes(app: FastifyInstance): void {
  app.get('/export/workspace', async (req, reply) => {
    const ctx = await requireProject(req, reply)
    if (!ctx) return
    const user = (req as { user?: SessionUser }).user
    if (!user || user.role !== 'admin') return reply.code(403).send({ error: 'Only workspace admins can export the workspace.' })
    const { stream, filename } = await streamWorkspaceArchive(user.workspaceId)
    logAuthEvent('workspace-export', { email: user.email, userId: user.id, ip: req.ip })
    reply.header('content-type', 'application/zip')
    reply.header('content-disposition', `attachment; filename="${filename}"`)
    return reply.send(stream)
  })
}

/* ------------------------------------------------------------- import */

export type ImportResult = { workspace: { id: string; name: string }; tables: Record<string, number>; files: number; chains: Record<string, boolean>; users: string[] }

/** Load a workspace archive into this server's database. Refuses when the
 * workspace or any of its people already exist here. */
export async function importWorkspaceArchive(zipBytes: Uint8Array): Promise<ImportResult> {
  const entries = unzipSync(zipBytes)
  const manifestRaw = entries['manifest.json']
  if (!manifestRaw) throw new Error('not an OpenChar workspace copy: manifest.json is missing')
  const manifest = JSON.parse(strFromU8(manifestRaw)) as {
    format: string
    version: number
    workspace: { id: string; name: string }
    files: { path: string; sha256: string; size: number }[]
  }
  if (manifest.format !== FORMAT) throw new Error('not an OpenChar workspace copy')
  if (manifest.version > FORMAT_VERSION) throw new Error(`this copy is format ${manifest.version}; update OpenChar to import it`)

  const read = (name: string): Record<string, unknown>[] => {
    const raw = entries[`data/${name}.json`]
    return raw ? (JSON.parse(strFromU8(raw)) as Record<string, unknown>[]) : []
  }

  if ((await pool.query(`SELECT 1 FROM workspaces WHERE id = $1`, [manifest.workspace.id])).rows.length) {
    throw new Error(`workspace ${manifest.workspace.id} already exists on this server`)
  }
  const emails = read('users').map((u) => String(u.email))
  const taken = (await pool.query(`SELECT email FROM users WHERE email = ANY($1)`, [emails])).rows.map((r) => r.email)
  if (taken.length) throw new Error(`these people already have accounts on this server: ${taken.join(', ')}`)

  // Files first, checked against their names, so a damaged copy stops before any row is written.
  const filePaths = new Map<string, string>()
  await mkdir(FILES_DIR, { recursive: true })
  for (const f of manifest.files) {
    const bytes = entries[f.path]
    if (!bytes) throw new Error(`${f.path} is listed in the manifest but missing from the copy`)
    const sha = createHash('sha256').update(bytes).digest('hex')
    if (sha !== f.sha256) throw new Error(`${f.path} does not match its SHA-256 hash; the copy is damaged`)
    const dest = path.join(FILES_DIR, path.basename(f.path))
    await writeFile(dest, bytes)
    filePaths.set(sha, dest)
  }

  const tables: Record<string, number> = {}
  const client: PoolClient = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const t of EXPORT_TABLES) {
      const rows = read(t.name)
      tables[t.name] = rows.length
      if (!rows.length) continue
      const { rows: colRows } = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [t.name]
      )
      const types = new Map(colRows.map((c) => [c.column_name as string, c.data_type as string]))
      for (const row of rows) {
        const r = { ...row }
        if (t.serial) delete r.id
        if (t.name === 'users') r.password_hash = '!'
        if (t.name === 'sources' && r.file_sha256) r.file_path = filePaths.get(String(r.file_sha256)) ?? null
        const cols = Object.keys(r).filter((c) => types.has(c))
        const values = cols.map((c) => {
          const v = r[c]
          return types.get(c) === 'jsonb' || types.get(c) === 'json' ? (v === null ? null : JSON.stringify(v)) : v
        })
        await client.query(
          `INSERT INTO ${t.name} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
          values
        )
      }
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  const chains: Record<string, boolean> = {}
  for (const p of read('projects')) {
    chains[String(p.id)] = (await verifyChain(String(p.id))).intact
  }
  return { workspace: manifest.workspace, tables, files: filePaths.size, chains, users: emails }
}
