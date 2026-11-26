/** The carbon sink register: soil is credited, other sinks are recorded and flagged. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl

test('SNK1 a concrete sink is recorded but not credited, and compliance says so', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  await page.goto('/console/sinks')
  await expect(page.locator('[data-testid="sink-type"][data-sink="soil"]')).toContainText('Credited')

  const d = await (await page.request.post(`${api}/dispatches`, { headers: H, data: { batchCode: SEED.batches.sampled, toName: 'Block maker (eval)', massKg: 120 } })).json()
  expect((await page.request.post(`${api}/applications`, { headers: H, data: { dispatchId: d.id, farmName: 'Blocks, Nakuru (eval)', areaHa: 0.01, appliedMassKg: 120, sink: 'tarmac' } })).status()).toBe(400)
  expect((await page.request.post(`${api}/applications`, { headers: H, data: { dispatchId: d.id, farmName: 'Blocks, Nakuru (eval)', areaHa: 0.01, appliedMassKg: 120, sink: 'concrete' } })).ok()).toBe(true)

  await page.reload()
  const concrete = page.locator('[data-testid="sink-type"][data-sink="concrete"]')
  await expect(concrete).toContainText('120')
  await expect(concrete).toContainText('Not credited')
  await page.goto('/console/compliance')
  await expect(page.locator('[data-req="SITE-SINKS"]')).toContainText('120 kg to concrete')

  // A wrong sink is corrected from the register.
  await page.goto('/console/sinks')
  await page.getByTestId('sink-row').filter({ hasText: 'Blocks, Nakuru (eval)' }).getByTestId('change-sink').click()
  await page.getByTestId('sink-select').selectOption('filtration')
  await page.getByTestId('sink-save').click()
  await expect(page.locator('[data-testid="sink-type"][data-sink="filtration"]')).toContainText('120')
  await expect(page.locator('[data-testid="sink-type"][data-sink="concrete"]')).toHaveCount(0)
})
