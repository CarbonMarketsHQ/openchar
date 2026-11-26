/** Road distances: collection and delivery kept apart, estimates labelled,
 * and the ledger changed only when a person applies them. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl

test('DIST1 consignments show an estimated distance until one is recorded', async ({ context, page }) => {
  await login(context, page.request)
  await page.goto('/console/gate')
  // Bahati (-0.15, 36.15) to the plant (-0.30, 36.08): 18.4 km in a straight line, times 1.3 for roads.
  const cn1 = page.locator('#consignment-CN-001').getByTestId('distance')
  await expect(cn1).toHaveText(/23\.9 km\s*est\./)
  await expect(cn1).toHaveAttribute('data-source', 'estimate')

  await page.goto(`/console/batches/${SEED.batches.sampled}`)
  const row = page.getByTestId('collection-row').filter({ hasText: 'CN-001' })
  await row.getByTestId('record-km').click()
  await page.getByTestId('km-input').fill('27.5')
  await page.getByTestId('km-save').click()
  await expect(row.getByTestId('distance')).toHaveText('27.5 km')
  await expect(row.getByTestId('distance')).toHaveAttribute('data-source', 'recorded')
  await expect(page.getByTestId('collection-summary')).toContainText('4 consignments')

  // The seeded delivery has destination coordinates; the ledger still uses the run inputs.
  await expect(page.getByTestId('delivery-row').getByTestId('distance')).toHaveText(/29\.\d km\s*est\./)
  await expect(page.getByTestId('ledger-transport')).toContainText('85 km for 1.25 t')
})

test('DIST2 delivery distances reach the ledger only when a person applies them', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const code = SEED.batches.awaitingLab
  expect((await page.request.put(`${api}/batches/${code}/ops`, { headers: H, data: { transportKm: 120, transportMassT: 1.1, electricityKwh: 300 } })).ok()).toBe(true)
  const made = await page.request.post(`${api}/dispatches`, { headers: H, data: { batchCode: code, toName: 'Rongai farm store', massKg: 1000 } })
  const { id } = (await made.json()) as { id: string }

  expect((await page.request.post(`${api}/batches/${code}/transport/apply`, { headers: H })).status()).toBe(400)
  expect((await page.request.patch(`${api}/dispatches/${id}/distance`, { headers: H, data: { destLat: 91, destLng: 36 } })).status()).toBe(400)
  expect((await page.request.patch(`${api}/dispatches/${id}/distance`, { headers: H, data: { destLat: -0.2 } })).status()).toBe(400)

  await page.goto(`/console/batches/${code}`)
  await expect(page.getByTestId('delivery-summary')).toContainText('needs a distance')
  await page.getByTestId('delivery-row').getByTestId('set-delivery').click()
  await page.getByTestId('dest-km').fill('41')
  await page.getByTestId('dest-save').click()
  await expect(page.getByTestId('delivery-summary')).toContainText('1 t, mass-weighted 41 km, 41 t·km')
  await expect(page.getByTestId('ledger-transport')).toContainText('120 km for 1.1 t')

  await page.getByTestId('apply-delivery').click()
  await expect(page.getByTestId('ledger-transport')).toContainText('41 km for 1 t')
  await expect(page.getByTestId('apply-delivery')).toHaveCount(0)
})
