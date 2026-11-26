/** Charter section 2 — API behaviour, exercised directly (A1-A6). */
import { expect, test } from '@playwright/test'
import { Client } from 'pg'
import { SEED, apiHeaders } from './helpers'

const api = SEED.apiUrl

async function sessionToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${api}/auth/login`, {
    headers: { Authorization: `Bearer ${SEED.apiToken}` },
    data: { email: SEED.email, password: SEED.password },
  })
  return ((await res.json()) as { token: string }).token
}

test('A1 health includes a db round-trip', async ({ request }) => {
  const res = await request.get(`${api}/health`)
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.db).toBe(true)
})

test('A2 service token and session are both enforced', async ({ request }) => {
  // No service token at all.
  expect((await request.get(`${api}/batches`)).status()).toBe(401)
  // Service token but no session.
  expect(
    (await request.get(`${api}/batches`, { headers: { Authorization: `Bearer ${SEED.apiToken}` } })).status()
  ).toBe(401)
  // Wrong password rejected.
  const bad = await request.post(`${api}/auth/login`, {
    headers: { Authorization: `Bearer ${SEED.apiToken}` },
    data: { email: SEED.email, password: 'wrong-password' },
  })
  expect(bad.status()).toBe(401)
  // Full credentials pass.
  const token = await sessionToken(request)
  const ok = await request.get(`${api}/batches`, { headers: apiHeaders(token) })
  expect(ok.ok()).toBe(true)
})

test('A2c token rotation: current and previous tokens both work, nothing else does', async ({ request }) => {
  const asToken = (t: string) => request.get(`${api}/projects`, { headers: { Authorization: `Bearer ${t}` } })
  // 401 for "session required" vs 401 for "unauthorized": the body tells which layer refused.
  expect(await (await asToken(SEED.apiToken)).json()).toEqual({ error: 'session required' })
  expect(await (await asToken('dev-token-previous')).json()).toEqual({ error: 'session required' })
  expect(await (await asToken('dev-token-other')).json()).toEqual({ error: 'unauthorized' })
  expect(await (await asToken('')).json()).toEqual({ error: 'unauthorized' })
})

test('A2b tenant isolation: a foreign workspace cannot reach the project', async ({ request }) => {
  const stamp = Date.now()
  const signup = await request.post(`${api}/auth/signup`, {
    headers: { Authorization: `Bearer ${SEED.apiToken}` },
    data: {
      workspaceName: `Isolation Probe ${stamp}`,
      name: 'Probe',
      email: `probe-${stamp}@example.test`,
      password: 'long-enough-password',
    },
  })
  expect(signup.ok()).toBe(true)
  const { token } = (await signup.json()) as { token: string }
  // The demo project is not visible from the new workspace.
  const res = await request.get(`${api}/batches`, { headers: apiHeaders(token, SEED.projectId) })
  expect(res.status()).toBe(404)
  const projects = await (
    await request.get(`${api}/projects`, { headers: apiHeaders(token, null) })
  ).json()
  expect(projects).toEqual([])
})

test('A3 seed integrity', async ({ request }) => {
  const token = await sessionToken(request)
  const summary = await (await request.get(`${api}/summary`, { headers: apiHeaders(token) })).json()
  expect(summary.suppliers).toBeGreaterThanOrEqual(3)
  expect(summary.consignments).toBeGreaterThanOrEqual(6)
  expect(summary.synthetic).toBe(true)
  expect(summary.facilities).toBeGreaterThanOrEqual(1)

  const batches = await (await request.get(`${api}/batches`, { headers: apiHeaders(token) })).json()
  expect(batches.length).toBeGreaterThanOrEqual(3)
  const byId = Object.fromEntries(batches.map((b: { id: string }) => [b.id, b]))
  expect(byId[SEED.batches.open].status).toBe('open')
  expect(byId[SEED.batches.sampled].status).toBe('sampled')
  expect(byId[SEED.batches.awaitingLab].status).toBe('awaiting-lab')

  const sampled = await (
    await request.get(`${api}/batches/${SEED.batches.sampled}`, { headers: apiHeaders(token) })
  ).json()
  expect(sampled.samples.length).toBe(3) // G-F74T-0: three independent samples
  expect(sampled.telemetry.points.length).toBeGreaterThan(50)
  expect(sampled.coProducts.filter((c: { kind: string }) => c.kind === 'bio-liquid').length).toBe(3)

  const chain = await (await request.get(`${api}/chain/verify`, { headers: apiHeaders(token) })).json()
  expect(chain.intact).toBe(true)
})

test('A4 tampering with a field event breaks the hash chain', async ({ request }) => {
  const token = await sessionToken(request)
  const client = new Client({ connectionString: SEED.dbUrl })
  await client.connect()
  try {
    await client.query(
      `UPDATE field_events SET payload = jsonb_set(payload, '{estMassKg}', '99999')
       WHERE id = (SELECT id FROM field_events ORDER BY seq LIMIT 1)`
    )
    const broken = await (await request.get(`${api}/chain/verify`, { headers: apiHeaders(token) })).json()
    expect(broken.intact).toBe(false)
    expect(broken.firstBreakSeq).toBeGreaterThanOrEqual(0)
  } finally {
    await client.end()
  }
})

test('A4b reseed restores an intact chain for later specs', async () => {
  const { execSync } = await import('node:child_process')
  execSync('npm run seed -w server', {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: SEED.dbUrl, SEED_FORCE: '1' },
  })
})

test('A5 seeded telemetry anomaly is flagged with its window', async ({ request }) => {
  const token = await sessionToken(request)
  const b = await (
    await request.get(`${api}/batches/${SEED.batches.sampled}`, { headers: apiHeaders(token) })
  ).json()
  expect(b.anomalies.length).toBeGreaterThan(0)
  const a = b.anomalies[0]
  expect(a.kind).toMatch(/temperature/i)
  expect(a.fromMinute).toBeGreaterThan(0)
  expect(a.toMinute).toBeGreaterThan(a.fromMinute)
})

test('A6 certify preview maps to Certify object shapes with uncomposited samples', async ({ request }) => {
  const token = await sessionToken(request)
  const res = await request.post(`${api}/certify/preview/${SEED.batches.sampled}`, {
    headers: apiHeaders(token),
  })
  expect(res.ok()).toBe(true)
  const p = await res.json()
  expect(p.mode).toBe('mock')
  expect(p.payload.feedstock_batch).toBeDefined()
  expect(p.payload.production_batch).toBeDefined()
  expect(p.payload.measurement_samples.length).toBe(3)
  expect(p.payload.sensor_series).toBeDefined()
  expect(p.payload.ghg_entry.gross_stored_tco2e).toBeCloseTo(SEED.ledger.gross, 4)
  expect(p.payload.ghg_entry.durability_factor).toBeCloseTo(SEED.ledger.fDurable, 4)
})

test('A7 evidence upload round-trips through the file store', async ({ request }) => {
  const token = await sessionToken(request)
  const content = `eval evidence ${Date.now()}`
  const up = await request.post(`${api}/sources/upload`, {
    headers: apiHeaders(token),
    multipart: {
      kind: 'calibration',
      title: 'Eval calibration note',
      file: { name: 'cal-note.txt', mimeType: 'text/plain', buffer: Buffer.from(content) },
    },
  })
  expect(up.ok()).toBe(true)
  const { id } = (await up.json()) as { id: string }
  const meta = await (await request.get(`${api}/sources/${id}`, { headers: apiHeaders(token) })).json()
  expect(meta.hasFile).toBe(true)
  const file = await request.get(`${api}/sources/${id}/file`, { headers: apiHeaders(token) })
  expect(file.ok()).toBe(true)
  expect(await file.text()).toBe(content)
})

test('A8 sensor export: Isometric bucket schema in JSON and real Parquet', async ({ request }) => {
  const token = await sessionToken(request)
  const json = await (
    await request.get(`${api}/batches/${SEED.batches.sampled}/sensor-export`, { headers: apiHeaders(token) })
  ).json()
  expect(json.aggregationSeconds).toBe(60)
  expect(json.buckets.length).toBeGreaterThan(100)
  const b = json.buckets[0]
  for (const k of [
    'aggregation_period_start_timestamp',
    'aggregation_period_end_timestamp',
    'sensor_reference',
    'minimum',
    'maximum',
    'mean',
    'median',
    'count',
    'standard_deviation',
    'first_timestamp',
    'last_timestamp',
  ]) {
    expect(b, `bucket has ${k}`).toHaveProperty(k)
  }
  const pq = await request.get(`${api}/batches/${SEED.batches.sampled}/sensor-export?format=parquet`, {
    headers: apiHeaders(token),
  })
  expect(pq.ok()).toBe(true)
  const body = await pq.body()
  expect(body.subarray(0, 4).toString()).toBe('PAR1') // Parquet magic
  expect(body.subarray(-4).toString()).toBe('PAR1')
})

test('A9 MQTT ingestion: a broker-published run lands as telemetry', async ({ request }) => {
  test.setTimeout(60_000)
  const { Aedes } = await import('aedes')
  const net = await import('node:net')
  const mqtt = (await import('mqtt')).default
  const broker = await Aedes.createBroker()
  const server = net.createServer(broker.handle)
  await new Promise<void>((r) => server.listen(18833, '127.0.0.1', () => r()))
  try {
    const token = await sessionToken(request)
    const facilities = await (await request.get(`${api}/facilities`, { headers: apiHeaders(token) })).json()
    const facilityId = facilities[0].id
    await request.post(`${api}/batches`, {
      headers: apiHeaders(token),
      data: { code: 'MQ-1', facilityId, notes: 'MQTT ingest eval' },
    })
    const patched = await request.patch(`${api}/facilities/${facilityId}`, {
      headers: apiHeaders(token),
      data: { mqttUrl: 'mqtt://127.0.0.1:18833', mqttTopic: 'oc/eval' },
    })
    expect(patched.ok()).toBe(true)

    // Wait for the ingest manager's refresh to subscribe, then publish.
    await new Promise((r) => setTimeout(r, 4000))
    const pub = mqtt.connect('mqtt://127.0.0.1:18833')
    await new Promise<void>((r) => pub.on('connect', () => r()))
    for (let m = 0; m < 12; m++) {
      pub.publish('oc/eval', JSON.stringify({ batchCode: 'MQ-1', minute: m, tempC: 100 + m * 40 }))
    }
    pub.end()

    let points: unknown[] = []
    for (let i = 0; i < 20; i++) {
      const b = await (await request.get(`${api}/batches/MQ-1`, { headers: apiHeaders(token) })).json()
      points = b.telemetry.points
      if (points.length >= 12) break
      await new Promise((r) => setTimeout(r, 1000))
    }
    expect(points.length).toBeGreaterThanOrEqual(12)
  } finally {
    await request
      .patch(`${api}/facilities/${(await (await request.get(`${api}/facilities`, { headers: apiHeaders(await sessionToken(request)) })).json())[0].id}`, {
        headers: apiHeaders(await sessionToken(request)),
        data: { mqttUrl: null, mqttTopic: null },
      })
      .catch(() => undefined)
    server.close()
    broker.close()
  }
})
