/**
 * Isometric Certify client. Live mode activates when credentials are
 * configured; until then every call reports mock mode and nothing leaves
 * the machine. The auth scheme and base URLs follow
 * docs.isometric.com/api-reference (Bearer JWT + x-client-secret,
 * api.sandbox.isometric.com for the sandbox).
 */

export type CertifyConfig = {
  mode: 'live' | 'mock'
  baseUrl: string
  detail: string
}

export function certifyConfig(): CertifyConfig {
  const key = process.env.ISOMETRIC_API_KEY
  const secret = process.env.ISOMETRIC_CLIENT_SECRET
  const baseUrl = process.env.ISOMETRIC_BASE_URL || 'https://api.sandbox.isometric.com'
  if (key && secret) {
    return { mode: 'live', baseUrl, detail: `Submitting to ${baseUrl}` }
  }
  return {
    mode: 'mock',
    baseUrl,
    detail:
      'Awaiting Isometric credentials (ISOMETRIC_API_KEY, ISOMETRIC_CLIENT_SECRET). Payloads are built and hashed exactly as they will be sent; nothing leaves this deployment.',
  }
}

export async function certifySubmit(
  payload: Record<string, unknown>
): Promise<{ mode: 'live' | 'mock'; status: number | null; response: unknown }> {
  const cfg = certifyConfig()
  if (cfg.mode === 'mock') {
    return { mode: 'mock', status: null, response: { held: true } }
  }
  const res = await fetch(`${cfg.baseUrl}/ghg-entries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ISOMETRIC_API_KEY}`,
      'x-client-secret': String(process.env.ISOMETRIC_CLIENT_SECRET),
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => null)
  return { mode: 'live', status: res.status, response: body }
}

/* ------------------------------------------------- sensor time series */

export type SensorBucket = {
  aggregation_period_start_timestamp: string
  aggregation_period_end_timestamp: string
  sensor_reference: string
  minimum: number
  maximum: number
  mean: number
  median: number
  count: number
  standard_deviation: number
  first_timestamp: string
  last_timestamp: string
}

/**
 * Aggregate a per-minute temperature series into Isometric's ≤60-second
 * sensor buckets (time-series-data-upload schema). Our telemetry is
 * already minute-grained, so each minute is one bucket.
 */
export function aggregateSensorSeries(
  sensorReference: string,
  startedAt: Date,
  points: { minute: number; tempC: number }[]
): SensorBucket[] {
  return points.map((p) => {
    const start = new Date(startedAt.getTime() + p.minute * 60000)
    const end = new Date(start.getTime() + 60000)
    return {
      aggregation_period_start_timestamp: start.toISOString(),
      aggregation_period_end_timestamp: end.toISOString(),
      sensor_reference: sensorReference,
      minimum: p.tempC,
      maximum: p.tempC,
      mean: p.tempC,
      median: p.tempC,
      count: 1,
      standard_deviation: 0,
      first_timestamp: start.toISOString(),
      last_timestamp: start.toISOString(),
    }
  })
}
