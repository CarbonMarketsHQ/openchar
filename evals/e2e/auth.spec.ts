/** Charter section 6 — auth and tenancy through the real UI. */
import { execSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { SEED } from './helpers'

test('AU1 console redirects to login; wrong then right credentials', async ({ page }) => {
  await page.goto('/console')
  await expect(page).toHaveURL(/\/login/)
  await page.getByTestId('login-email').fill(SEED.email)
  await page.getByTestId('login-password').fill('not-the-password')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-error')).toBeVisible()
  await page.getByTestId('login-password').fill(SEED.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/console/)
  await expect(page.getByTestId('synthetic-badge')).toBeVisible() // demo project is synthetic
})

test('AU2 sign out returns to login and locks the console', async ({ page }) => {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(SEED.email)
  await page.getByTestId('login-password').fill(SEED.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/console/)
  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/console/batches')
  await expect(page).toHaveURL(/\/login/)
})

test('AU3 signup creates an isolated workspace and a project through the UI', async ({ page }) => {
  const stamp = Date.now()
  await page.goto('/signup')
  await page.getByTestId('signup-workspace').fill(`Fresh Workspace ${stamp}`)
  await page.getByTestId('signup-name').fill('Eval Admin')
  await page.getByTestId('signup-email').fill(`fresh-${stamp}@example.test`)
  await page.getByTestId('signup-password').fill('a-long-password-1')
  await page.getByTestId('signup-submit').click()
  await expect(page).toHaveURL(/\/console\/projects/)
  await expect(page.getByTestId('empty-state')).toBeVisible()

  // None of the demo tenant's data is reachable.
  await page.goto(`/console/batches/${SEED.batches.sampled}`)
  await expect(page.getByTestId('empty-state')).toBeVisible()

  // Every data page guides the fresh workspace instead of erroring.
  for (const path of ['/console', '/console/gate', '/console/compliance']) {
    await page.goto(path)
    await expect(page.getByTestId('empty-state')).toBeVisible()
    await expect(page.getByTestId('empty-state')).toContainText(/project/i)
  }

  // Create a project through the dialog; the console comes alive.
  await page.goto('/console/projects')
  await page.getByTestId('new-project').click()
  await page.getByTestId('project-name').fill('First Project')
  await page.getByTestId('project-district').fill('Kisumu County, Kenya')
  await page.getByTestId('project-tsoil').fill('26')
  await page.getByTestId('project-tsoil-source').fill('Lembrechts et al. 2022, Pune district')
  await page.getByTestId('project-save').click()
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await expect(page.getByTestId('project-card')).toContainText('First Project')
})

test('AU4 password change: old stops working, other sessions die', async ({ request }) => {
  const H = { Authorization: `Bearer ${SEED.apiToken}` }
  const login = async (pw: string) =>
    request.post(`${SEED.apiUrl}/auth/login`, { headers: H, data: { email: SEED.email, password: pw } })

  const first = await login(SEED.password)
  expect(first.ok()).toBe(true)
  const tokenA = ((await first.json()) as { token: string }).token
  const second = await login(SEED.password)
  const tokenB = ((await second.json()) as { token: string }).token

  const change = await request.post(`${SEED.apiUrl}/auth/change-password`, {
    headers: { ...H, 'X-Session': tokenA },
    data: { currentPassword: SEED.password, newPassword: 'another-long-pass-1' },
  })
  expect(change.ok()).toBe(true)

  // The old password is dead, the other session is dead, the changing one lives.
  expect((await login(SEED.password)).status()).toBe(401)
  const asB = await request.get(`${SEED.apiUrl}/auth/me`, { headers: { ...H, 'X-Session': tokenB } })
  expect(asB.status()).toBe(401)
  const asA = await request.get(`${SEED.apiUrl}/auth/me`, { headers: { ...H, 'X-Session': tokenA } })
  expect(asA.ok()).toBe(true)

  // Restore the seed password for later specs.
  const restore = await request.post(`${SEED.apiUrl}/auth/change-password`, {
    headers: { ...H, 'X-Session': tokenA },
    data: { currentPassword: 'another-long-pass-1', newPassword: SEED.password },
  })
  expect(restore.ok()).toBe(true)
})

test('AU5 operator reset link: UI reset flow, old sessions die', async ({ page, request }) => {
  const link = execSync(`npm run -s admin -w server -- reset-link ${SEED.email}`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: SEED.dbUrl, APP_URL: 'http://localhost:3187' },
  })
    .toString()
    .trim()
    .split('\n')
    .pop()!
  expect(link).toMatch(/\/reset\?token=[a-f0-9]{64}$/)

  await page.goto(link)
  await page.getByTestId('reset-password').fill('reset-flow-pass-1')
  await page.getByTestId('reset-save').click()
  await expect(page).toHaveURL(/\/login/)

  const H = { Authorization: `Bearer ${SEED.apiToken}` }
  expect(
    (
      await request.post(`${SEED.apiUrl}/auth/login`, { headers: H, data: { email: SEED.email, password: SEED.password } })
    ).status()
  ).toBe(401)
  const fresh = await request.post(`${SEED.apiUrl}/auth/login`, {
    headers: H,
    data: { email: SEED.email, password: 'reset-flow-pass-1' },
  })
  expect(fresh.ok()).toBe(true)
  const token = ((await fresh.json()) as { token: string }).token

  // A used token cannot be replayed.
  const replay = await request.post(`${SEED.apiUrl}/auth/reset`, {
    headers: H,
    data: { token: link.split('token=')[1], newPassword: 'whatever-else-1' },
  })
  expect(replay.status()).toBe(400)

  // Restore the seed password.
  const restore = await request.post(`${SEED.apiUrl}/auth/change-password`, {
    headers: { ...H, 'X-Session': token },
    data: { currentPassword: 'reset-flow-pass-1', newPassword: SEED.password },
  })
  expect(restore.ok()).toBe(true)
})

test('AU6 auth events: failures and changes are on the audit trail, admins only', async ({ request }) => {
  const H = { Authorization: `Bearer ${SEED.apiToken}` }
  await request.post(`${SEED.apiUrl}/auth/login`, { headers: H, data: { email: SEED.email, password: 'bad-pass-on-purpose' } })
  const ok = await request.post(`${SEED.apiUrl}/auth/login`, { headers: H, data: { email: SEED.email, password: SEED.password } })
  const token = ((await ok.json()) as { token: string }).token
  const events = (await (
    await request.get(`${SEED.apiUrl}/auth/events`, { headers: { ...H, 'X-Session': token } })
  ).json()) as { kind: string; email: string }[]
  const kinds = events.map((e) => e.kind)
  expect(kinds).toContain('login-fail')
  expect(kinds).toContain('login-ok')
  expect(kinds).toContain('reset-complete')
  // The trail only shows this workspace's accounts.
  expect(events.every((e) => e.email === SEED.email || e.email === null)).toBe(true)
})

test('AU7 verifier seat: reads everything, writes nothing', async ({ request }) => {
  const H = { Authorization: `Bearer ${SEED.apiToken}` }
  const admin = await request.post(`${SEED.apiUrl}/auth/login`, {
    headers: H,
    data: { email: SEED.email, password: SEED.password },
  })
  const adminToken = ((await admin.json()) as { token: string }).token
  const email = `verifier-${Date.now()}@example.test`
  const created = await request.post(`${SEED.apiUrl}/auth/users`, {
    headers: { ...H, 'X-Session': adminToken },
    data: { email, name: 'Eval Verifier', role: 'verifier', password: 'verifier-pass-1' },
  })
  expect(created.ok()).toBe(true)

  const v = await request.post(`${SEED.apiUrl}/auth/login`, { headers: H, data: { email, password: 'verifier-pass-1' } })
  const vToken = ((await v.json()) as { token: string }).token
  const vHeaders = { ...H, 'X-Session': vToken, 'X-Project': SEED.projectId }

  // Reads work: batches, ledger, compliance, evidence.
  expect((await request.get(`${SEED.apiUrl}/batches`, { headers: vHeaders })).ok()).toBe(true)
  expect((await request.get(`${SEED.apiUrl}/batches/${SEED.batches.sampled}/ledger`, { headers: vHeaders })).ok()).toBe(true)
  expect((await request.get(`${SEED.apiUrl}/compliance`, { headers: vHeaders })).ok()).toBe(true)

  // Writes are refused across the surface.
  expect(
    (
      await request.post(`${SEED.apiUrl}/suppliers`, {
        headers: vHeaders,
        data: { name: 'X', village: 'Y', category: 'agri-residue' },
      })
    ).status()
  ).toBe(403)
  expect(
    (await request.post(`${SEED.apiUrl}/batches`, { headers: vHeaders, data: { code: 'NOPE-1' } })).status()
  ).toBe(403)
  expect(
    (await request.post(`${SEED.apiUrl}/certify/submit/${SEED.batches.sampled}`, { headers: vHeaders })).status()
  ).toBe(403)
  // Admin surfaces stay closed too.
  expect((await request.get(`${SEED.apiUrl}/auth/users`, { headers: { ...H, 'X-Session': vToken } })).status()).toBe(403)
  // Their own password is the one thing they may change.
  const pw = await request.post(`${SEED.apiUrl}/auth/change-password`, {
    headers: { ...H, 'X-Session': vToken },
    data: { currentPassword: 'verifier-pass-1', newPassword: 'verifier-pass-2' },
  })
  expect(pw.ok()).toBe(true)
})

test('AU8 five failed logins raise an in-app brute-force alert', async ({ request }) => {
  const H = { Authorization: `Bearer ${SEED.apiToken}` }
  for (let i = 0; i < 5; i++) {
    await request.post(`${SEED.apiUrl}/auth/login`, { headers: H, data: { email: SEED.email, password: `wrong-${i}-xxxx` } })
  }
  const ok = await request.post(`${SEED.apiUrl}/auth/login`, { headers: H, data: { email: SEED.email, password: SEED.password } })
  const token = ((await ok.json()) as { token: string }).token
  const events = (await (
    await request.get(`${SEED.apiUrl}/auth/events?limit=500`, { headers: { ...H, 'X-Session': token } })
  ).json()) as { kind: string }[]
  expect(events.map((e) => e.kind)).toContain('alert-bruteforce')
})

test('AU9 rate limits and the audit trail key on the person, not the web server', async ({ request }) => {
  test.setTimeout(60_000)
  const H = { Authorization: `Bearer ${SEED.apiToken}` }
  const stamp = Date.now()
  const email = `ip-probe-${stamp}@example.test`
  const signup = await request.post(`${SEED.apiUrl}/auth/signup`, {
    headers: H,
    data: { workspaceName: `IP Probe ${stamp}`, name: 'Probe', email, password: 'long-enough-password' },
  })
  const token = ((await signup.json()) as { token: string }).token

  // The relayed address lands on the trail; a malformed one is ignored.
  await request.post(`${SEED.apiUrl}/auth/login`, {
    headers: { ...H, 'X-Client-IP': '203.0.113.9' },
    data: { email, password: 'wrong-on-purpose' },
  })
  await request.post(`${SEED.apiUrl}/auth/login`, {
    headers: { ...H, 'X-Client-IP': 'not-an-address' },
    data: { email, password: 'wrong-on-purpose' },
  })
  const events = (await (
    await request.get(`${SEED.apiUrl}/auth/events`, { headers: { ...H, 'X-Session': token } })
  ).json()) as { kind: string; ip: string | null }[]
  const ips = events.filter((e) => e.kind === 'login-fail').map((e) => e.ip)
  expect(ips).toContain('203.0.113.9')
  expect(ips).not.toContain('not-an-address')

  // One visitor exhausting the limit leaves everyone else untouched.
  const max = Number(process.env.AUTH_RATE_MAX ?? 1000)
  const a = `192.0.2.${10 + (stamp % 100)}`
  const b = `192.0.2.${120 + (stamp % 100)}`
  const hit = (ip: string) =>
    request.post(`${SEED.apiUrl}/auth/reset`, {
      headers: { ...H, 'X-Client-IP': ip },
      data: { token: 'x', newPassword: 'short' },
    })
  for (let sent = 0; sent < max; sent += 100) {
    await Promise.all(Array.from({ length: Math.min(100, max - sent) }, () => hit(a)))
  }
  expect((await hit(a)).status()).toBe(429)
  expect((await hit(b)).status()).toBe(400)
})
