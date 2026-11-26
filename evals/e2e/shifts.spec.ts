/** The operator shift log: shifts, handovers and downtime by cause. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl
const local = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

test('SL1 hand over a shift, start the next, and log downtime from the console', async ({ context, page }) => {
  await login(context, page.request)
  await page.goto('/console/shifts')

  // The seeded night shift is still on, with the batch it is running.
  const now = page.getByTestId('shift-open')
  await expect(now.getByTestId('shift-operator-now')).toHaveText('Otieno Ochieng')
  await expect(now).toContainText(SEED.batches.open)
  await expect(page.getByTestId('last-handover')).toContainText('Generator diesel')

  await page.getByTestId('end-shift').click()
  await page.getByTestId('shift-handover').fill('HT-01 at 540 °C. Diesel delivered, generator tank full.')
  await page.getByTestId('shift-end-submit').click()
  await expect(now).toContainText('No one on shift')
  await expect(page.getByTestId('last-handover')).toHaveText('HT-01 at 540 °C. Diesel delivered, generator tank full.')

  await page.getByTestId('start-shift').first().click()
  await page.getByTestId('shift-operator').fill('Eval Operator')
  await page.getByTestId('shift-submit').click()
  await expect(now.getByTestId('shift-operator-now')).toHaveText('Eval Operator')

  const before = await page.getByTestId('downtime-row').count()
  await page.getByTestId('log-downtime').click()
  await page.getByTestId('downtime-cause').selectOption('feedstock-shortage')
  const end = new Date(Date.now() - 5 * 60000)
  await page.getByTestId('downtime-start').fill(local(new Date(end.getTime() - 75 * 60000)))
  await page.getByTestId('downtime-end').fill(local(end))
  await page.getByTestId('downtime-note').fill('Waiting for the Subukia load')
  await page.getByTestId('downtime-submit').click()
  await expect(page.getByTestId('downtime-row')).toHaveCount(before + 1)
  const row = page.getByTestId('downtime-row').filter({ hasText: 'Waiting for the Subukia load' })
  await expect(row).toContainText('Feedstock shortage')
  await expect(row).toContainText('1 h 15 min')
  await expect(page.getByTestId('cause-row').filter({ hasText: 'Feedstock shortage' })).toContainText('1 h 15 min')
})

test('SL2 the log refuses impossible entries and clips downtime to the month', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const post = (path: string, data: object) => page.request.post(`${api}${path}`, { headers: H, data })

  expect((await post('/shifts', { operator: '  ' })).status()).toBe(400)
  const open = await post('/shifts', { operator: 'Second Operator' })
  // SL1 left a shift running, so a second one on the same plant is refused.
  expect(open.status()).toBe(409)
  const { open: current } = (await (await page.request.get(`${api}/shifts`, { headers: H })).json()) as { open: { id: string; startedAt: string }[] }
  const id = current[0].id
  const patch = (data: object) => page.request.patch(`${api}/shifts/${id}`, { headers: H, data })
  expect((await patch({ end: true, handover: 'x', endedAt: new Date(Date.parse(current[0].startedAt) - 60000).toISOString() })).status()).toBe(400)
  expect((await patch({ end: true })).status()).toBe(400)

  expect((await post('/downtime', { cause: 'gremlins' })).status()).toBe(400)
  const t = Date.now() - 3600000
  expect((await post('/downtime', { cause: 'weather', startedAt: new Date(t).toISOString(), endedAt: new Date(t - 60000).toISOString() })).status()).toBe(400)

  // A stop that starts 60 minutes before the month and ends 30 minutes into it counts 30 minutes.
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const month = monthStart.toISOString().slice(0, 7)
  const total = async () =>
    ((await (await page.request.get(`${api}/downtime?month=${month}`, { headers: H })).json()) as { totalMin: number }).totalMin
  const before = await total()
  const made = await post('/downtime', {
    cause: 'weather',
    startedAt: new Date(monthStart.getTime() - 60 * 60000).toISOString(),
    endedAt: new Date(monthStart.getTime() + 30 * 60000).toISOString(),
    note: 'Storm across the month change',
  })
  expect(made.ok()).toBe(true)
  expect((await total()) - before).toBe(30)
})

test('SL3 a batch names the operators who ran it', async ({ context, page }) => {
  await login(context, page.request)
  await page.goto(`/console/batches/${SEED.batches.open}`)
  await expect(page.getByTestId('batch-operators')).toContainText('Achieng Atieno')
  await expect(page.getByTestId('batch-operators')).toContainText('Wanjiru Kamau')
})
