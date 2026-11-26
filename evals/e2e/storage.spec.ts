/** Storage locations: placing, moving, returning and counting units. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl

test('STO1 units are placed, moved, counted and returned, each step in their custody chain', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const made = (await (
    await page.request.post(`${api}/batches/${SEED.batches.sampled}/units`, { headers: H, data: { count: 3, massKgEach: 50, kind: 'bag', locationId: 'loc-silo' } })
  ).json()) as { created: string[] }
  const [a, b, c] = made.created
  expect((await page.request.post(`${api}/batches/${SEED.batches.sampled}/units`, { headers: H, data: { count: 1, massKgEach: 50, locationId: 'loc-nope' } })).status()).toBe(404)

  await page.goto('/console/storage')
  const silo = page.locator('[data-testid="location-card"][data-location="Silo 1"]')
  const shed = page.locator('[data-testid="location-card"][data-location="Bagging shed"]')
  await expect(silo.getByTestId('stock-unit').filter({ hasText: a })).toBeVisible()

  // Move one bag to the shed.
  await shed.getByTestId('move-here').click()
  await page.locator(`[data-testid="move-pick"][value="${a}"]`).check()
  await page.getByTestId('move-submit').click()
  await expect(shed.getByTestId('stock-unit').filter({ hasText: a })).toBeVisible()
  await expect(silo.getByTestId('stock-unit').filter({ hasText: a })).toHaveCount(0)

  // Count the silo: one bag found, one missing, one label that belongs elsewhere.
  await silo.getByTestId('count-stock').click()
  await page.getByTestId('count-found').fill(`${b}\n${a}`)
  await page.getByTestId('count-submit').click()
  await expect(page.getByTestId('count-result')).toContainText(`Missing: ${c}`)
  await expect(page.getByTestId('count-result')).toContainText(`Not expected here: ${a}`)
  await page.keyboard.press('Escape')
  await expect(silo.getByTestId('last-count')).toContainText('Count did not match')

  // Deliver one, then it comes back to the shed.
  expect((await page.request.post(`${api}/units/${b}/return`, { headers: H, data: { locationId: 'loc-shed' } })).status()).toBe(404)
  await page.request.post(`${api}/units/${b}/deliver`, { headers: H, data: { toName: 'Bulk buyer (eval)' } })
  await page.goto(`/console/units/${b}`)
  await page.getByTestId('unit-return').click()
  await page.getByTestId('unit-return-to').selectOption({ label: 'Bagging shed' })
  await page.getByTestId('unit-return-reason').fill('Wrong grade')
  await page.getByTestId('unit-return-save').click()
  await expect(page.getByTestId('unit-status')).toHaveText('In storage')
  await expect(page.getByTestId('unit-event').last()).toContainText('Back to Bagging shed: Wrong grade')
  await page.goto(`/console/units/${a}`)
  await expect(page.getByTestId('unit-event').last()).toContainText('From Silo 1 to Bagging shed')
})
