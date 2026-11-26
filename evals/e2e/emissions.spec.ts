/** Operational emissions by scope, from the fuel log, meters and road legs. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl

test('EMI1 scopes add up from their sources, by month, source and batch', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  type E = {
    months: { month: string; scope1: number; scope2: number; scope3: number }[]
    totals: { scope1: number; scope2: number; scope3: number }
    total: number
    sources: { source: string; scope: number; co2eT: number }[]
    batches: { code: string; scope1: number; scope2: number; scope3: number }[]
    notes: { gridFactor: number; gridKwh: number; biogenicFuelKg: number }
  }
  const e = (await (await page.request.get(`${api}/emissions?months=6`, { headers: H })).json()) as E

  // Scope 1 is the fossil part of the fuel log: the seeded 92 litres of diesel at 2.68 kg per litre.
  const fuel = (await (await page.request.get(`${api}/fuel`, { headers: H })).json()) as { totalCo2eT: number }
  expect(e.totals.scope1).toBeCloseTo(fuel.totalCo2eT, 3)
  expect(e.notes.biogenicFuelKg).toBe(35)
  // Scope 2 is metered kWh times the project's grid factor.
  expect(e.totals.scope2).toBeCloseTo(e.notes.gridKwh * e.notes.gridFactor, 2)
  // Months, sources and scopes are three views of one total.
  const byMonth = e.months.reduce((n, m) => n + m.scope1 + m.scope2 + m.scope3, 0)
  expect(byMonth).toBeCloseTo(e.total, 3)
  expect(e.sources.reduce((n, s) => n + s.co2eT, 0)).toBeCloseTo(e.total, 3)
  // HT-02: 43 litres of diesel, 420 kWh across its window, and its road legs.
  const ht02 = e.batches.find((b) => b.code === SEED.batches.sampled)!
  expect(ht02.scope1).toBeCloseTo(0.1152, 4)
  expect(ht02.scope2).toBeCloseTo(420 * 0.000716, 4)
  expect(ht02.scope3).toBeGreaterThan(0)

  await page.goto('/console/emissions')
  await expect(page.getByTestId('scope-bar')).toHaveCount(6)
  await expect(page.getByTestId('total-scope1')).toContainText(`${Math.round(e.totals.scope1 * 1000)}`)
  await expect(page.getByTestId('source-row').first()).toContainText('Grid electricity')
  await expect(page.getByTestId('emissions-batch-row').filter({ hasText: 'HT-01' })).toContainText('Open')
  await page.getByTestId('period-3').click()
  await expect(page.getByTestId('scope-bar')).toHaveCount(3)
})
