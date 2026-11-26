/** Charter W2-W7, W9, U5(missing id) — the plant console, scene by scene. */
import { expect, test } from '@playwright/test'
import { SEED, dataValue, login } from './helpers'

test.use({ viewport: { width: 1280, height: 800 } })

test.beforeEach(async ({ context, page }) => {
  await login(context, page.request)
})

test('W2 gate: attach a pending consignment to a lot, both masses visible', async ({ page }) => {
  await page.goto('/console/gate')
  const pending = page.getByTestId('consignment-row').filter({ hasText: 'CN-PENDING' })
  await expect(pending).toBeVisible()

  await page.getByTestId('gate-new-lot').click()
  await page.getByTestId('lot-consignment').selectOption('CN-PENDING')
  await page.getByTestId('lot-weighbridge-mass').fill('405')
  await page.getByTestId('lot-moisture').fill('22')
  await page.getByTestId('lot-save').click()

  const lot = page.getByTestId('lot-card').last()
  await expect(lot).toBeVisible()
  await expect(lot.getByTestId('lot-hopper-mass')).toContainText('kg')
  await expect(lot.getByTestId('lot-weighbridge-slip-mass')).toContainText('405')
  await expect(lot.getByTestId('lot-mass-delta')).toBeVisible()
})

test('W3 batch: telemetry chart, marked anomaly window, batch-age rule', async ({ page }) => {
  await page.goto(`/console/batches/${SEED.batches.sampled}`)
  await expect(page.getByTestId('batch-status')).toHaveText('Sampled')
  await expect(page.getByTestId('temp-chart')).toBeVisible()
  await expect(page.getByTestId('anomaly-marker')).toBeVisible()
  await expect(page.getByTestId('anomaly-list-item').first()).toContainText(/temperature/i)
  await expect(page.getByTestId('batch-age')).toContainText(/day/i)
})

test('W4 lab: three samples, certificate values with source link, gates pass', async ({ page }) => {
  await page.goto('/console/lab')
  const rows = page.getByTestId('sample-row').filter({ hasText: SEED.batches.sampled })
  await expect(rows).toHaveCount(3) // G-F74T-0, never composited
  await expect(page.getByTestId('lab-corg').first()).toContainText('78')
  await expect(page.getByTestId('lab-hcorg').first()).toContainText('0.42')
  await expect(page.getByTestId('lab-ocorg').first()).toContainText('0.12')
  await expect(page.getByTestId('gate-hcorg').first()).toHaveAttribute('data-state', 'pass')
  await expect(page.getByTestId('gate-ocorg').first()).toHaveAttribute('data-state', 'pass')
  await expect(page.getByTestId('lab-cert-source').first()).toBeVisible()
})

test('W5 ledger: fixture arithmetic on screen, assumption labelled', async ({ page }) => {
  await page.goto(`/console/ledger/${SEED.batches.sampled}`)
  expect(await dataValue(page.getByTestId('ledger-gross'))).toBeCloseTo(SEED.ledger.gross, 3)
  expect(await dataValue(page.getByTestId('ledger-fdurable'))).toBeCloseTo(SEED.ledger.fDurable, 4)
  await expect(page.getByTestId('ledger-counterfactual')).toContainText(/pending/i)
  const net = await dataValue(page.getByTestId('ledger-net-conservative'))
  expect(net).toBeLessThan(SEED.ledger.netMean)
  expect(net).toBeGreaterThan(1.5)
})

test('W5b/W9 provenance: a ledger line opens to datapoints and reaches its source', async ({ page }) => {
  await page.goto(`/console/ledger/${SEED.batches.sampled}`)
  await page.getByTestId('ledger-line-toggle').first().click()
  const evidence = page.getByTestId('evidence-link').first()
  await expect(evidence).toBeVisible()
  await evidence.click()
  await expect(page.getByTestId('source-record')).toBeVisible()
})

test('W6 compliance: computed states and site readiness from onboarding data', async ({ page }) => {
  await page.goto('/console/compliance')
  for (const id of ['R-6YSW-0', 'G-F74T-0', 'G-KQSC-0', 'R-TKNH-0', 'R-8W08-0', 'G-6VWJ-0', 'R-3MBJ-0']) {
    await expect(page.locator(`[data-req="${id}"]`)).toBeVisible()
  }
  const body = page.getByTestId('compliance-table')
  await expect(body).toContainText(/weighbridge/i)
  await expect(body).toContainText(/17025/i)
  await expect(body).toContainText(/activat/i) // the activation line, mass-balanced out
  // Badge text is capitalized, never a raw slug.
  await expect(page.locator('[data-req="R-6YSW-0"] .ui-badge')).toHaveText('Pass')
})

test('W7 certify: mock-mode banner, payload, recorded submission', async ({ page }) => {
  await page.goto('/console/certify')
  await expect(page.getByTestId('certify-mode')).toContainText(/Awaiting Isometric credentials|Submitting to/)
  await expect(page.getByTestId('certify-payload')).toContainText('production_batch')
  await page.getByTestId('certify-submit').click()
  const row = page.getByTestId('submission-row').first()
  await expect(row).toBeVisible()
  await expect(row).toContainText(/[a-f0-9]{12}/)
})

test('U5 missing id renders a designed empty state', async ({ page }) => {
  await page.goto('/console/batches/NOPE-404')
  await expect(page.getByTestId('empty-state')).toBeVisible()
})
