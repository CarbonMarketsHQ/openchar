/**
 * Industrial telemetry ingestion over MQTT: the generic path for plants
 * whose PLC/SCADA can publish, before any vendor-specific historian
 * connector. Each facility may name a broker and topic; the manager keeps
 * one subscription per configured facility and upserts telemetry rows for
 * messages shaped { batchCode, minute, tempC }.
 */
import mqtt, { type MqttClient } from 'mqtt'
import { pool } from './db.js'

type Active = { key: string; client: MqttClient }
const active = new Map<string, Active>()

async function handleMessage(projectId: string, payload: Buffer) {
  let msg: { batchCode?: string; minute?: number; tempC?: number }
  try {
    msg = JSON.parse(payload.toString())
  } catch {
    return
  }
  if (!msg.batchCode || !Number.isFinite(msg.minute) || !Number.isFinite(msg.tempC)) return
  const batch = (
    await pool.query(`SELECT id FROM batches WHERE project_id = $1 AND code = $2`, [projectId, msg.batchCode])
  ).rows[0]
  if (!batch) return
  await pool.query(
    `INSERT INTO telemetry (batch_id, minute, temp_c) VALUES ($1, $2, $3)
     ON CONFLICT (batch_id, minute) DO UPDATE SET temp_c = $3`,
    [batch.id, Math.round(msg.minute!), msg.tempC]
  )
}

async function refresh() {
  const { rows } = await pool.query(
    `SELECT id, project_id, mqtt_url, mqtt_topic FROM facilities WHERE mqtt_url IS NOT NULL AND mqtt_topic IS NOT NULL`
  )
  const wanted = new Map(rows.map((f) => [f.id as string, `${f.mqtt_url}|${f.mqtt_topic}`]))

  for (const [facilityId, entry] of active) {
    if (wanted.get(facilityId) !== entry.key) {
      entry.client.end(true)
      active.delete(facilityId)
    }
  }
  for (const f of rows) {
    const key = `${f.mqtt_url}|${f.mqtt_topic}`
    if (active.get(f.id)?.key === key) continue
    try {
      const client = mqtt.connect(f.mqtt_url, { reconnectPeriod: 5000, connectTimeout: 5000 })
      client.on('connect', () => client.subscribe(f.mqtt_topic))
      client.on('message', (_topic, payload) => {
        void handleMessage(f.project_id, payload)
      })
      client.on('error', () => undefined)
      active.set(f.id, { key, client })
    } catch {
      /* broker unreachable; the next refresh retries */
    }
  }
}

export function startMqttIngest() {
  const interval = Number(process.env.MQTT_REFRESH_MS || 60_000)
  void refresh()
  setInterval(() => void refresh(), interval).unref()
}
