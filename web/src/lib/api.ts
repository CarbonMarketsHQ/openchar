/**
 * Server-side API client. The browser never talks to the VM API directly:
 * server components and route handlers call it with the service token plus
 * the user's session and selected project from cookies.
 */
import { cookies, headers as requestHeaders } from 'next/headers'

const API_URL = process.env.API_URL ?? 'http://localhost:8788'
const API_TOKEN = process.env.API_TOKEN ?? 'dev-token'

export const SESSION_COOKIE = 'oc_session'
export const PROJECT_COOKIE = 'oc_project'

/** The visitor's address as Vercel (or next start) received it. Vercel
 * overwrites both headers at its edge, so a browser cannot forge them. */
export async function clientIp(): Promise<string | null> {
  const h = await requestHeaders()
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

export async function apiHeaders(): Promise<Record<string, string>> {
  const jar = await cookies()
  const headers: Record<string, string> = { Authorization: `Bearer ${API_TOKEN}` }
  const session = jar.get(SESSION_COOKIE)?.value
  const project = jar.get(PROJECT_COOKIE)?.value
  const ip = await clientIp()
  if (session) headers['X-Session'] = session
  if (project) headers['X-Project'] = project
  if (ip) headers['X-Client-IP'] = ip
  return headers
}

/** Returns the parsed body, or null on any failure (including 401/404). */
export async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await apiRaw(path, init)
  if (!res || !res.ok) return null
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function apiRaw(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(await apiHeaders()),
        ...(init?.body && typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
    })
  } catch {
    return null
  }
}

export type Me = {
  user: { id: string; email: string; name: string; role: string; workspaceId: string; workspaceName: string }
  projects: { id: string; name: string; district: string; synthetic: boolean }[]
}

export type Project = {
  id: string
  name: string
  district: string
  synthetic: boolean
  tSoilC: number
  tSoilSource: string
  durabilityBasis: string
  public: boolean
  gridEfTPerKwh: number | null
  gridEfSource: string | null
  batchCount: number
}

export type Facility = {
  id: string
  name: string
  gpsLat: number | null
  gpsLng: number | null
  reactorMake: string | null
  reactorType: string | null
  nameplateTpd: number | null
  scalesNote: string | null
  labPartner: string | null
  stackTestDoneAt: string | null
  mqttUrl: string | null
  mqttTopic: string | null
}

export type BatchRow = {
  id: string
  status: string
  openedAt: string
  closedAt: string | null
  ageDays: number
  feedstockMassKg: number | null
  biocharWetKg: number | null
  biocharMoistureFrac: number | null
  durationMin: number | null
  gps: { lat: number; lng: number } | null
  notes: string
  sampleCount: number
}

export type BatchDetail = BatchRow & {
  telemetry: { points: { minute: number; tempC: number }[] }
  anomalies: { kind: string; fromMinute: number; toMinute: number; minTempC: number }[]
  samples: { id: string; label: string; state: string; takenAt: string; note: string }[]
  certificate: {
    id: string
    lab: string
    corgFrac: number
    hCorg: number
    oCorg: number
    moistureFrac: number
    sourceId: string | null
  } | null
  coProducts: { id: string; grade: string; kind: string; massKg: number; fate: string }[]
  dispatches: {
    id: string
    toName: string
    massKg: number
    dispatchedAt: string
    applications: {
      id: string
      farmName: string
      appliedMassKg: number
      appliedAt: string
      areaHa?: number
      gps?: boolean
      boundaryPoints?: number
      photos?: number
      video?: boolean
      signedBy?: string | null
    }[]
  }[]
  ops: { transportKm: number; transportMassT: number; electricityKwh: number } | null
  lots: { id: string; hopperMassKg: number }[]
}

export type LedgerBundle = {
  result: {
    batchId: string
    gatePass: boolean
    grossT: number
    grossSigmaT: number
    fDurable: number
    fCapped: boolean
    tUsedC: number
    durableT: number
    deductionsT: number
    counterfactualT: number
    netMeanT: number
    netConservativeT: number
    sigmaT: number
    lines: { kind: string; label: string; value: number; unit: string; datapointIds: string[]; note?: string }[]
    flags: string[]
  }
  datapoints: {
    id: string
    label: string
    value: number
    unit: string
    sd?: number
    sourceIds: string[]
    sources: { id: string; title: string; kind: string }[]
  }[]
  assumptions: string[]
}

export type Compliance = {
  requirements: { id: string; title: string; state: 'pass' | 'warn' | 'fail'; detail: string }[]
  site: { id: string; title: string; state: 'pass' | 'warn' | 'fail'; detail: string }[]
}

export type Summary = {
  id: string
  name: string
  district: string
  synthetic: boolean
  tSoilC: number
  suppliers: number
  consignments: number
  batches: number
  sampledBatches: number
  facilities: number
  tonnesConservative: number
  updatedAt: string
}

export type Distance = { km: number | null; source: 'recorded' | 'estimate' | null }

export type Consignment = {
  id: string
  supplierName: string
  distance?: Distance
  estMassKg: number
  moistureFrac: number | null
  category: string
  state: string
  capturedAt: string
  lotId: string | null
}

export type Lot = {
  id: string
  hopperMassKg: number
  weighbridgeSlipKg: number | null
  moistureFrac: number | null
  slipSourceId: string | null
  batchCode: string | null
  consignments: { id: string; estMassKg: number }[]
  createdAt: string
}
