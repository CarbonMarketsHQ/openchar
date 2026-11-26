import { createHash, randomBytes } from 'node:crypto'
import pg from 'pg'

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://biochar:biochar@localhost:5466/biochar',
  max: 5,
})

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id text PRIMARY KEY, name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id),
      email text NOT NULL UNIQUE, name text NOT NULL,
      role text NOT NULL DEFAULT 'member',
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS auth_events (
      id serial PRIMARY KEY,
      at timestamptz NOT NULL DEFAULT now(),
      email text, user_id text, kind text NOT NULL, ip text
    );
    CREATE TABLE IF NOT EXISTS projects (
      id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id),
      name text NOT NULL, district text NOT NULL,
      synthetic boolean NOT NULL DEFAULT false,
      t_soil_c numeric NOT NULL, t_soil_source text NOT NULL,
      durability_basis text NOT NULL DEFAULT '200yr',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS facilities (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      name text NOT NULL, gps_lat numeric, gps_lng numeric,
      reactor_make text, reactor_type text, nameplate_tpd numeric,
      scales_note text, lab_partner text, stack_test_done_at date,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sources (
      id text PRIMARY KEY, project_id text REFERENCES projects(id),
      kind text NOT NULL, title text NOT NULL,
      ref text, note text,
      file_path text, file_sha256 text, mime text, size_bytes bigint,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      name text NOT NULL, village text NOT NULL, category text NOT NULL,
      lat numeric, lng numeric
    );
    CREATE TABLE IF NOT EXISTS field_events (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      seq integer NOT NULL,
      kind text NOT NULL, payload jsonb NOT NULL, device_id text NOT NULL,
      captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
      prev_hash text NOT NULL, hash text NOT NULL,
      UNIQUE (project_id, seq)
    );
    CREATE TABLE IF NOT EXISTS consignments (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      supplier_id text NOT NULL REFERENCES suppliers(id),
      est_mass_kg numeric NOT NULL, moisture_frac numeric,
      category text NOT NULL, state text NOT NULL DEFAULT 'received',
      photo_ref text, gps_lat numeric, gps_lng numeric,
      captured_at timestamptz NOT NULL, lot_id text
    );
    CREATE TABLE IF NOT EXISTS lots (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      hopper_mass_kg numeric NOT NULL,
      weighbridge_slip_kg numeric, moisture_frac numeric,
      slip_source_id text REFERENCES sources(id),
      batch_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS batches (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      facility_id text REFERENCES facilities(id),
      code text NOT NULL,
      status text NOT NULL, opened_at timestamptz NOT NULL, closed_at timestamptz,
      feedstock_mass_kg numeric, biochar_wet_kg numeric, biochar_moisture_frac numeric,
      duration_min integer, gps_lat numeric, gps_lng numeric, notes text,
      UNIQUE (project_id, code)
    );
    CREATE TABLE IF NOT EXISTS telemetry (
      batch_id text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      minute integer NOT NULL,
      temp_c numeric NOT NULL, PRIMARY KEY (batch_id, minute)
    );
    CREATE TABLE IF NOT EXISTS co_products (
      id text PRIMARY KEY, batch_id text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      kind text NOT NULL, grade text NOT NULL, mass_kg numeric NOT NULL, fate text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS samples (
      id text PRIMARY KEY, batch_id text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      label text NOT NULL,
      taken_at timestamptz NOT NULL, state text NOT NULL, note text
    );
    CREATE TABLE IF NOT EXISTS certificates (
      id text PRIMARY KEY, batch_id text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      lab text NOT NULL, corg_frac numeric NOT NULL, h_corg numeric NOT NULL,
      o_corg numeric NOT NULL, moisture_frac numeric NOT NULL,
      source_id text REFERENCES sources(id)
    );
    CREATE TABLE IF NOT EXISTS batch_ops (
      batch_id text PRIMARY KEY REFERENCES batches(id) ON DELETE CASCADE,
      transport_km numeric NOT NULL, transport_mass_t numeric NOT NULL,
      electricity_kwh numeric NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dispatches (
      id text PRIMARY KEY, batch_id text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      to_name text NOT NULL, mass_kg numeric NOT NULL, dispatched_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applications (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      dispatch_id text REFERENCES dispatches(id),
      farm_name text NOT NULL, area_ha numeric NOT NULL, polygon jsonb,
      applied_mass_kg numeric NOT NULL, applied_at timestamptz NOT NULL,
      source_id text REFERENCES sources(id)
    );
    CREATE TABLE IF NOT EXISTS units (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      origin_batch_id text REFERENCES batches(id),
      kind text NOT NULL DEFAULT 'bag',
      mass_kg numeric NOT NULL,
      status text NOT NULL DEFAULT 'in-storage',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS unit_parents (
      unit_id text NOT NULL REFERENCES units(id),
      parent_id text NOT NULL REFERENCES units(id),
      PRIMARY KEY (unit_id, parent_id)
    );
    CREATE TABLE IF NOT EXISTS unit_events (
      id serial PRIMARY KEY, unit_id text NOT NULL REFERENCES units(id),
      kind text NOT NULL, at timestamptz NOT NULL DEFAULT now(), detail jsonb
    );
    CREATE TABLE IF NOT EXISTS certify_submissions (
      id serial PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      batch_code text NOT NULL,
      payload_hash text NOT NULL, mode text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    -- Documents attached to the records they are evidence for.
    CREATE TABLE IF NOT EXISTS source_links (
      source_id text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      project_id text NOT NULL REFERENCES projects(id),
      record_kind text NOT NULL, record_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_id, record_kind, record_id)
    );
    CREATE INDEX IF NOT EXISTS source_links_record ON source_links (project_id, record_kind, record_id);
    -- The operator shift log and downtime by cause.
    CREATE TABLE IF NOT EXISTS shifts (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      facility_id text REFERENCES facilities(id),
      operator text NOT NULL,
      started_at timestamptz NOT NULL, ended_at timestamptz,
      notes text, handover text, created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS shifts_project_started ON shifts (project_id, started_at DESC);
    CREATE TABLE IF NOT EXISTS downtime (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      facility_id text REFERENCES facilities(id),
      cause text NOT NULL,
      started_at timestamptz NOT NULL, ended_at timestamptz,
      note text, created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    -- The calibration register.
    CREATE TABLE IF NOT EXISTS instruments (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      facility_id text REFERENCES facilities(id),
      name text NOT NULL, kind text NOT NULL, serial text,
      interval_days integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS calibrations (
      id text PRIMARY KEY, instrument_id text NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
      calibrated_on date NOT NULL, next_due date NOT NULL,
      performed_by text NOT NULL, result text NOT NULL,
      source_id text REFERENCES sources(id), note text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS calibration_alerts (
      instrument_id text NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
      due_on date NOT NULL, kind text NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (instrument_id, due_on, kind)
    );
    -- A person's decision that flagged records are not duplicates.
    CREATE TABLE IF NOT EXISTS duplicate_reviews (
      id serial PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      kind text NOT NULL, ids text[] NOT NULL,
      decided_by text, note text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    -- Fuel burned at the plant and on vehicle trips, and cumulative meter readings.
    CREATE TABLE IF NOT EXISTS fuel_logs (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      batch_id text REFERENCES batches(id) ON DELETE SET NULL,
      logged_at timestamptz NOT NULL, fuel text NOT NULL, quantity numeric NOT NULL,
      use text NOT NULL, vehicle text, trip_km numeric, note text, created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS meter_readings (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
      meter text NOT NULL, read_at timestamptz NOT NULL, kwh numeric NOT NULL,
      source text NOT NULL DEFAULT 'manual',
      UNIQUE (project_id, meter, read_at)
    );
    -- Written by deploy/backup/backup.sh after each good run; platform-wide,
    -- so seeding never truncates it.
    CREATE TABLE IF NOT EXISTS backup_runs (
      id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
      db_bytes bigint NOT NULL, files_bytes bigint NOT NULL, offsite boolean NOT NULL
    );
  `)
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT false`)
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS grid_ef_t_per_kwh numeric`)
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS grid_ef_source text`)
  await pool.query(`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS mqtt_url text`)
  await pool.query(`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS mqtt_topic text`)
  await pool.query(`ALTER TABLE consignments ADD COLUMN IF NOT EXISTS distance_km numeric`)
  await pool.query(`ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS distance_km numeric`)
  await pool.query(`ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS dest_lat numeric`)
  await pool.query(`ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS dest_lng numeric`)
  await pool.query(`ALTER TABLE batch_ops ADD COLUMN IF NOT EXISTS collection_tkm numeric`)
  await pool.query(`ALTER TABLE batch_ops ADD COLUMN IF NOT EXISTS fuel_tco2e numeric`)
}

/** Canonical JSON: keys sorted recursively, so a jsonb round-trip through
 * Postgres (which does not preserve key order) hashes identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    )
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function eventHash(prevHash: string, id: string, kind: string, capturedAt: string, payload: unknown): string {
  return createHash('sha256')
    .update(prevHash + '|' + id + '|' + kind + '|' + capturedAt + '|' + canonicalJson(payload))
    .digest('hex')
}

/** The field-event chain is per project, so one tenant's records can be
 * verified, exported and audited without touching another's. */
export async function verifyChain(projectId: string): Promise<{
  intact: boolean
  firstBreakSeq: number | null
  length: number
}> {
  const { rows } = await pool.query(
    `SELECT id, seq, kind, payload, captured_at, prev_hash, hash FROM field_events
     WHERE project_id = $1 ORDER BY seq`,
    [projectId]
  )
  let prev = 'genesis'
  for (const r of rows) {
    const expected = eventHash(prev, r.id, r.kind, new Date(r.captured_at).toISOString(), r.payload)
    if (r.prev_hash !== prev || r.hash !== expected) {
      return { intact: false, firstBreakSeq: r.seq, length: rows.length }
    }
    prev = r.hash
  }
  return { intact: true, firstBreakSeq: null, length: rows.length }
}

export async function appendEvents(
  projectId: string,
  events: { id: string; kind: string; capturedAt: string; deviceId: string; payload: Record<string, unknown> }[]
): Promise<number> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tail = await client.query(
      `SELECT hash, seq FROM field_events WHERE project_id = $1 ORDER BY seq DESC LIMIT 1`,
      [projectId]
    )
    let prev = tail.rows[0]?.hash ?? 'genesis'
    let seq = (tail.rows[0]?.seq ?? -1) + 1
    for (const e of events) {
      const hash = eventHash(prev, e.id, e.kind, e.capturedAt, e.payload)
      await client.query(
        `INSERT INTO field_events (id, project_id, seq, kind, payload, device_id, captured_at, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [e.id, projectId, seq, e.kind, JSON.stringify(e.payload), e.deviceId, e.capturedAt, prev, hash]
      )
      prev = hash
      seq += 1
    }
    await client.query('COMMIT')
    return events.length
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
