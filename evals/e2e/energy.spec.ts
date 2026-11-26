/** Fuel, electricity meters and feedstock collection reach the ledger only
 * when a person applies them. HT-03 is used so the verified HT-02 ledger
 * stays as seeded for later specs. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl
const code = SEED.batches.awaitingLab

test('ENG1 log fuel on a batch and apply fuel, metered electricity and collection to its ledger', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  // Run inputs for the batch, as an operator would have entered them.
  expect((await page.request.put(`${api}/batches/${code}/ops`, { headers: H, data: { transportKm: 60, transportMassT: 1.1, electricityKwh: 380 } })).ok()).toBe(true)

  await page.goto(`/console/batches/${code}`)
  const card = page.getByTestId('batch-energy')
  // The start-up fuel on HT-03 was biomass: biogenic, no fossil CO2.
  await expect(card.getByTestId('fuel-summary')).toContainText('1 entry, 0 kg CO2e fossil')
  await expect(card.getByTestId('meter-summary')).toContainText('210 kWh on Main meter')

  await card.getByTestId('log-fuel').click()
  await page.getByTestId('fuel-type').selectOption('diesel')
  await page.getByTestId('fuel-use').selectOption('generator')
  await page.getByTestId('fuel-qty').fill('10')
  await page.getByTestId('fuel-submit').click()
  // 10 litres of diesel at 2.68 kg CO2 per litre.
  await expect(card.getByTestId('fuel-summary')).toContainText('2 entries, 27 kg CO2e fossil')
  await expect(card.getByTestId('ledger-fuel')).toContainText('not in the ledger yet')

  await card.getByTestId('apply-fuel').click()
  await expect(card.getByTestId('ledger-fuel')).toContainText('uses 27 kg CO2e')
  await card.getByTestId('apply-electricity').click()
  await expect(card.getByTestId('ledger-electricity')).toContainText('uses 210 kWh')
  await expect(card.getByTestId('apply-electricity')).toHaveCount(0)

  const transport = page.getByTestId('batch-transport')
  await expect(transport.getByTestId('ledger-transport')).toContainText('Collection is not in the ledger yet')
  await transport.getByTestId('apply-collection').click()
  await expect(transport.getByTestId('ledger-transport')).toContainText(/collection line [\d.]+ t·km/)
})

test('ENG2 meter readings arrive by hand, CSV or feed; bad input is refused', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const post = (data: object) => page.request.post(`${api}/meters/readings`, { headers: H, data })

  expect((await post({ csv: 'meter,kwh\nX,1' })).status()).toBe(400)
  expect((await post({ csv: 'meter,read_at,kwh\nDryer meter,not a date,4' })).status()).toBe(400)
  expect((await post({ meter: '', kwh: 5 })).status()).toBe(400)
  expect((await post({ readings: [{ meter: 'Dryer meter', readAt: new Date().toISOString(), kwh: 12.5 }] })).ok()).toBe(true)
  expect((await page.request.post(`${api}/fuel`, { headers: H, data: { fuel: 'kerosene', use: 'generator', quantity: 5 } })).status()).toBe(400)
  expect((await page.request.post(`${api}/fuel`, { headers: H, data: { fuel: 'diesel', use: 'generator', quantity: 0 } })).status()).toBe(400)

  await page.goto('/console/energy')
  await page.getByTestId('readings-file').setInputFiles({
    name: 'dryer.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`meter,read_at,kwh\nDryer meter,${new Date(Date.now() - 3600000).toISOString()},10\nDryer meter,${new Date(Date.now() + 1000).toISOString()},14\n`),
  })
  await expect(page.getByTestId('readings-msg')).toHaveText('2 readings added.')
  const dryer = page.getByTestId('meter-row').filter({ hasText: 'Dryer meter' })
  await expect(dryer).toContainText('CSV upload')
  await expect(dryer).toContainText('14 kWh')
  // A meter fitted after a batch plays no part in it: the older batch still reads its main meter.
  const energy = (await (await page.request.get(`${api}/batches/${SEED.batches.sampled}/energy`, { headers: H })).json()) as {
    electricity: { kwh: number; meters: string[] }
  }
  expect(energy.electricity.kwh).toBe(420)
  expect(energy.electricity.meters).toEqual(['Main meter'])
  // The vehicle trip in the seed is logged without a batch.
  await expect(page.getByTestId('fuel-row').filter({ hasText: 'Delivery truck (demo)' })).toContainText('58 km')
})
