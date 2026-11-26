/** Trends across batches: each figure from the records, gaps where a record is missing. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl

test('TR1 yield, throughput, residence and energy per batch, with gaps instead of guesses', async ({ context, page }) => {
  const token = await login(context, page.request)
  type T = {
    code: string
    dryYieldPct: number | null
    throughputKgPerDay: number | null
    throughputKgPerShift: number | null
    shifts: number
    residenceMin: number | null
    kwhPerDryTonne: number | null
  }
  const t = (await (await page.request.get(`${api}/trends`, { headers: apiHeaders(token) })).json()) as { batches: T[]; months: { batches: number }[] }
  const ht02 = t.batches.find((b) => b.code === SEED.batches.sampled)!
  // 1,025 kg dry biochar from 3,696 kg dry feedstock, 180 minutes at temperature,
  // 420 kWh across 14 days for 4,800 kg of feedstock.
  expect(ht02.dryYieldPct).toBe(27.7)
  expect(ht02.residenceMin).toBe(180)
  expect(ht02.kwhPerDryTonne).toBe(410)
  expect(ht02.throughputKgPerDay).toBe(343)
  // No shifts were logged during HT-02, so there is no per-shift figure.
  expect(ht02.shifts).toBe(0)
  expect(ht02.throughputKgPerShift).toBeNull()
  // The open batch has shifts but no biochar yet.
  const ht01 = t.batches.find((b) => b.code === SEED.batches.open)!
  expect(ht01.dryYieldPct).toBeNull()
  expect(ht01.throughputKgPerShift).toBe(Math.round(1900 / ht01.shifts))

  await page.goto('/console/trends')
  const yieldCard = page.getByTestId('trend-dryYieldPct')
  await expect(yieldCard.getByTestId('mini-bar')).toHaveCount(t.batches.length)
  await expect(yieldCard.locator('[data-testid="mini-bar"][data-empty="true"]')).toHaveCount(
    t.batches.filter((b) => b.dryYieldPct === null).length
  )
  await expect(yieldCard).toContainText('27.7')
  await expect(page.getByTestId('trend-month').first()).toContainText(String(t.months[0].batches))
})
