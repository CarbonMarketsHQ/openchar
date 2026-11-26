/** Self-hosting contract: invites instead of shared passwords, and nothing
 * public until the owner publishes it. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

test('SH1 an admin invites a teammate by link and the teammate sets their own password', async ({ context, page, request }) => {
  await login(context, request)
  const email = `invitee-${Date.now()}@example.test`
  await page.goto('/console/account')
  await page.getByTestId('add-user').click()
  await page.getByTestId('user-name').fill('Invited Operator')
  await page.getByTestId('user-email').fill(email)
  await page.getByTestId('user-save').click()
  const link = page.getByTestId('invite-link')
  await expect(link).toBeVisible()
  const url = new URL((await link.textContent())!.trim())
  expect(url.searchParams.get('invite')).toBe('1')

  // Before the invite is used, no password signs this account in.
  const early = await request.post(`${SEED.apiUrl}/auth/login`, {
    headers: { Authorization: `Bearer ${SEED.apiToken}` },
    data: { email, password: '!' },
  })
  expect(early.status()).toBe(401)

  await context.clearCookies()
  await page.goto(`${url.pathname}${url.search}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/choose your password/i)
  await page.getByTestId('reset-password').fill('invited-pass-123')
  await page.getByTestId('reset-save').click()
  await page.waitForURL('**/login')
  const ok = await request.post(`${SEED.apiUrl}/auth/login`, {
    headers: { Authorization: `Bearer ${SEED.apiToken}` },
    data: { email, password: 'invited-pass-123' },
  })
  expect(ok.ok()).toBe(true)
})

test('SH2 a project page is public only while the owner publishes it', async ({ request }) => {
  const res = await request.post(`${SEED.apiUrl}/auth/login`, {
    headers: { Authorization: `Bearer ${SEED.apiToken}` },
    data: { email: SEED.email, password: SEED.password },
  })
  const { token } = (await res.json()) as { token: string }
  const h = apiHeaders(token)
  const path = `${SEED.apiUrl}/public/projects/${SEED.projectId}/summary`
  const pub = { headers: { Authorization: `Bearer ${SEED.apiToken}` } }

  expect((await request.get(path, pub)).ok()).toBe(true)
  const off = await request.patch(`${SEED.apiUrl}/projects/${SEED.projectId}`, { headers: h, data: { public: false } })
  expect(off.ok()).toBe(true)
  expect((await request.get(path, pub)).status()).toBe(404)
  const on = await request.patch(`${SEED.apiUrl}/projects/${SEED.projectId}`, { headers: h, data: { public: true } })
  expect(on.ok()).toBe(true)
  expect((await request.get(path, pub)).ok()).toBe(true)
})

test('SH3 the sign-in screen learns the sign-up policy from the server', async ({ request }) => {
  const res = await request.get(`${SEED.apiUrl}/auth/config`, { headers: { Authorization: `Bearer ${SEED.apiToken}` } })
  expect(res.ok()).toBe(true)
  const config = (await res.json()) as { setupRequired: boolean; signup: string; signupUrl: string | null }
  expect(config.setupRequired).toBe(false)
  // The eval server runs with SIGNUP_MODE=open; the shipped default is closed.
  expect(config.signup).toBe('open')
  expect(config.signupUrl).toBe('/signup')
})
