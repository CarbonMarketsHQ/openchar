/** The self-serve workspace copy, and loading it into another server. */
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { Client } from 'pg'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl
type Manifest = {
  format: string
  version: number
  workspace: { id: string; name: string }
  tables: Record<string, number>
  files: { path: string; sha256: string; size: number }[]
  notExported: Record<string, string>
}

let zipPath = ''
let dir = ''

test.beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'openchar-export-'))
})
test.afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('EX1 an admin downloads a full copy: every table, every file, no credentials', async ({ context, page }) => {
  const token = await login(context, page.request)
  // One uploaded file, so the copy has a file to carry.
  await page.request.post(`${api}/documents`, {
    headers: apiHeaders(token),
    multipart: {
      type: 'permit',
      title: 'Export eval permit',
      file: { name: 'permit.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4 export ${Date.now()}`) },
    },
  })

  await page.goto('/console/account')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-workspace').click()])
  expect(download.suggestedFilename()).toMatch(/^openchar-nyota-biochar-demo-\d{4}-\d{2}-\d{2}\.zip$/)
  zipPath = path.join(dir, 'copy.zip')
  await download.saveAs(zipPath)

  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)))
  const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as Manifest
  expect(manifest.format).toBe('openchar-workspace')
  expect(manifest.tables.telemetry).toBeGreaterThan(300)
  expect(manifest.tables.field_events).toBeGreaterThan(0)

  // Every table in the database is either in the copy or deliberately left out.
  const db = new Client({ connectionString: SEED.dbUrl })
  await db.connect()
  const { rows } = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)
  const { rows: b } = await db.query(
    `SELECT count(*)::int AS n FROM batches WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = $1)`,
    [manifest.workspace.id]
  )
  expect(manifest.tables.batches).toBe(b[0].n)
  await db.end()
  for (const r of rows) {
    expect(Object.keys(manifest.tables).concat(Object.keys(manifest.notExported))).toContain(r.table_name)
  }

  // Tables as JSON and CSV. No password hashes, no sessions.
  const users = JSON.parse(strFromU8(entries['data/users.json'])) as Record<string, unknown>[]
  expect(users.length).toBeGreaterThan(0)
  for (const u of users) expect(u).not.toHaveProperty('password_hash')
  expect(entries['data/sessions.json']).toBeUndefined()
  expect(strFromU8(entries['csv/batches.csv']).split('\n')[0]).toContain('code')

  // Files travel byte for byte.
  expect(manifest.files.length).toBeGreaterThan(0)
  for (const f of manifest.files) {
    expect(createHash('sha256').update(entries[f.path]).digest('hex')).toBe(f.sha256)
  }
})

test('EX2 a verifier seat cannot export the workspace', async ({ page }) => {
  const admin = await (
    await page.request.post(`${api}/auth/login`, {
      headers: { Authorization: `Bearer ${SEED.apiToken}` },
      data: { email: SEED.email, password: SEED.password },
    })
  ).json()
  const email = `verifier-${Date.now()}@openchar.example`
  const password = 'verifier-eval-pass-1'
  const made = await page.request.post(`${api}/auth/users`, {
    headers: apiHeaders(admin.token),
    data: { email, name: 'Eval verifier', role: 'verifier', password },
  })
  expect(made.ok()).toBe(true)
  const v = await (
    await page.request.post(`${api}/auth/login`, { headers: { Authorization: `Bearer ${SEED.apiToken}` }, data: { email, password } })
  ).json()
  const res = await page.request.get(`${api}/export/workspace`, { headers: apiHeaders(v.token) })
  expect(res.status()).toBe(403)
})

test('EX3 the copy loads into an empty server with its hash chain intact', async () => {
  test.skip(!zipPath || !existsSync(zipPath), 'needs the copy from EX1')
  const target = 'openchar_import_eval'
  const admin = new Client({ connectionString: SEED.dbUrl })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${target}`)
  await admin.query(`CREATE DATABASE ${target}`)
  const url = SEED.dbUrl.replace(/\/[^/]+$/, `/${target}`)
  const filesDir = path.join(dir, 'files')
  const env = { ...process.env, DATABASE_URL: url, FILES_DIR: filesDir, APP_URL: 'http://localhost:3187' }
  // tsx directly: under `npm run` the CLI's exit status is not passed through.
  const cli = (zip: string, stdio: 'pipe' | undefined = undefined) =>
    execSync(`npx tsx src/admin.ts import-workspace ${zip}`, { env, encoding: 'utf8', cwd: path.resolve('server'), stdio })
  try {
    const out = cli(zipPath)
    expect(out).toContain('hash chain intact')
    expect(out).not.toContain('BROKEN')
    expect(out).toMatch(/demo@openchar\.example\s+http:\/\/localhost:3187\/reset\?/)

    const manifest = JSON.parse(strFromU8(unzipSync(new Uint8Array(readFileSync(zipPath)))['manifest.json'])) as Manifest
    const db = new Client({ connectionString: url })
    await db.connect()
    for (const [table, n] of Object.entries(manifest.tables)) {
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table}`)
      expect(rows[0].n, table).toBe(n)
    }
    const { rows: pw } = await db.query(`SELECT DISTINCT password_hash FROM users`)
    expect(pw.map((r) => r.password_hash)).toEqual(['!'])
    const { rows: files } = await db.query(`SELECT file_path, file_sha256 FROM sources WHERE file_path IS NOT NULL`)
    expect(files.length).toBe(manifest.files.length)
    for (const f of files) {
      expect(createHash('sha256').update(readFileSync(f.file_path)).digest('hex')).toBe(f.file_sha256)
    }
    await db.end()

    // A second import of the same copy is refused, not merged.
    let refused = ''
    try {
      cli(zipPath, 'pipe')
    } catch (e) {
      refused = String((e as { stderr?: string }).stderr ?? e)
    }
    expect(refused).toContain('already exists')
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${target} WITH (FORCE)`)
    await admin.end()
    writeFileSync(path.join(dir, '.done'), '')
  }
})
