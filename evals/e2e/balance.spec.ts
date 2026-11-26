/** Mass and carbon balance: residual gas, yields, and the checks that catch bad entries. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl
const code = SEED.batches.sampled

test('BAL1 a batch balances its mass, and its carbon once the feedstock carbon is given', async ({ context, page }) => {
  await login(context, page.request)
  await page.goto(`/console/batches/${code}`)
  const card = page.getByTestId('batch-balance')
  // 4,800 kg in: 1,250 kg biochar, 50 kg to the activation line, 550 kg bio-liquids, 2,950 kg left as gas and vapour.
  await expect(card).toContainText('1,250 kg')
  await expect(card).toContainText('550 kg')
  await expect(card).toContainText('2,950 kg')
  await expect(card.locator('[data-check="outputs-within-input"]')).toHaveAttribute('data-state', 'pass')
  // 1,025 kg dry biochar from 3,696 kg dry feedstock.
  await expect(card.locator('[data-check="biochar-yield"]')).toContainText('27.7%')
  await expect(card.getByTestId('balance-carbon-missing')).toContainText('feedstock carbon content')

  await card.getByTestId('set-feedstock-carbon').click()
  await page.getByTestId('feedstock-carbon-pct').fill('45')
  await page.getByTestId('feedstock-carbon-source').fill('Ultimate analysis of maize cobs (demo)')
  await page.getByTestId('feedstock-carbon-save').click()
  // 3,696 kg × 45% = 1,663 kg carbon in, 1,025 kg × 78% = 800 kg in the biochar: 48.1%.
  await expect(card.locator('[data-check="carbon-yield"]')).toHaveAttribute('data-state', 'pass')
  await expect(card.locator('[data-check="carbon-yield"]')).toContainText('48.1%')
  await expect(card.getByTestId('balance-carbon-source')).toContainText('Ultimate analysis of maize cobs (demo)')
})

test('BAL2 the checks fail on impossible numbers, and bad inputs are refused', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const patch = (data: object) => page.request.patch(`${api}/batches/${code}/balance`, { headers: H, data })
  const checks = async () =>
    ((await (await page.request.get(`${api}/batches/${code}/balance`, { headers: H })).json()) as { checks: { id: string; state: string }[] }).checks

  expect((await patch({ feedstockCarbonPct: 120, feedstockCarbonSource: 'x' })).status()).toBe(400)
  expect((await patch({ feedstockCarbonPct: 45 })).status()).toBe(400)
  expect((await patch({ gasKg: -5 })).status()).toBe(400)

  // Weighed gas that does not close the balance.
  expect((await patch({ gasKg: 5000 })).ok()).toBe(true)
  expect((await checks()).find((c) => c.id === 'closure')?.state).toBe('fail')
  // Weighed gas that does.
  expect((await patch({ gasKg: 2900 })).ok()).toBe(true)
  expect((await checks()).find((c) => c.id === 'closure')?.state).toBe('pass')

  // A feedstock carbon content too low for the lab result: the biochar would hold more carbon than went in.
  expect((await patch({ feedstockCarbonPct: 10, feedstockCarbonSource: 'Typo' })).ok()).toBe(true)
  expect((await checks()).find((c) => c.id === 'carbon-yield')?.state).toBe('fail')

  expect((await patch({ feedstockCarbonPct: 45, feedstockCarbonSource: 'Ultimate analysis of maize cobs (demo)', gasKg: null })).ok()).toBe(true)
})
