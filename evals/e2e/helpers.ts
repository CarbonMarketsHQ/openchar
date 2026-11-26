import type { APIRequestContext, BrowserContext } from '@playwright/test'

/** The selector and seed contract the web app must honour. */
export const SEED = {
  projectId: 'prj-demo',
  email: 'demo@openchar.example',
  password: 'charcoal-demo-2026',
  apiToken: 'dev-token',
  apiUrl: 'http://localhost:8788',
  dbUrl: 'postgres://biochar:biochar@localhost:5466/biochar',
  batches: { open: 'HT-01', sampled: 'HT-02', awaitingLab: 'HT-03' },
  suppliers: ['Bahati Farmers Cooperative (demo)', 'Rongai Maize Growers (demo)', 'Subukia Village Cluster (demo)'],
  ledger: {
    gross: 2.9297248,
    // Woolf 200-year model at the demo's 21.5 °C soil and H/Corg 0.42:
    // 1 - (-0.048 + (-0.383 + 0.350 ln 21.5) × 0.42), computed by hand.
    fDurable: 0.757856,
    // durable 2.2203102 minus seeded deductions 0.3124075 (transport
    // 85 km × 1.25 t × 0.00011 + electricity 420 kWh × 0.000716)
    netMean: 1.9079027,
  },
}

/** Log in against the API directly and plant the web session cookies. */
export async function login(
  context: BrowserContext,
  request: APIRequestContext,
  creds: { email: string; password: string; projectId?: string | null } = {
    email: SEED.email,
    password: SEED.password,
    projectId: SEED.projectId,
  }
): Promise<string> {
  const res = await request.post(`${SEED.apiUrl}/auth/login`, {
    headers: { Authorization: `Bearer ${SEED.apiToken}` },
    data: { email: creds.email, password: creds.password },
  })
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`)
  const { token } = (await res.json()) as { token: string }
  const cookies = [{ name: 'oc_session', value: token, domain: 'localhost', path: '/' }]
  if (creds.projectId) cookies.push({ name: 'oc_project', value: creds.projectId, domain: 'localhost', path: '/' })
  await context.addCookies(cookies)
  return token
}

/** Headers for direct API calls as a session user. */
export function apiHeaders(token: string, projectId: string | null = SEED.projectId): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${SEED.apiToken}`,
    'X-Session': token,
  }
  if (projectId) h['X-Project'] = projectId
  return h
}

export async function setTheme(context: BrowserContext, theme: 'field' | 'paper') {
  await context.addCookies([{ name: 'dmrv_theme', value: theme, domain: 'localhost', path: '/' }])
}

/** Numeric value carried by a [data-value] attribute on a stat element. */
export async function dataValue(locator: import('@playwright/test').Locator): Promise<number> {
  const v = await locator.getAttribute('data-value')
  if (v === null) throw new Error('element has no data-value attribute')
  return Number(v)
}
