/**
 * Charter section 6 — the full write lifecycle through the UI, as a plant
 * team would drive it: supplier → facility stack test → open batch →
 * telemetry → samples → close → certificate → run inputs → co-product →
 * dispatch → application → ledger.
 */
import { expect, test } from '@playwright/test'
import { SEED, login } from './helpers'

const CODE = 'EV-RUN-1'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ context, page }) => {
  await login(context, page.request)
})

test('WR1 register a supplier through the dialog', async ({ page }) => {
  await page.goto('/console/suppliers')
  await page.getByTestId('new-supplier').click()
  await page.getByTestId('supplier-name').fill('Eval Growers Collective')
  await page.getByTestId('supplier-village').fill('Saoner')
  await page.getByTestId('supplier-category').selectOption('agri-residue')
  await page.getByTestId('supplier-save').click()
  const row = page.getByTestId('supplier-row').filter({ hasText: 'Eval Growers Collective' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Agri residue') // statusLabel capitalizes
})

test('WR2 record a stack test; R-TKNH-0 turns pass', async ({ page }) => {
  await page.goto('/console/facilities')
  await expect(page.getByTestId('facility-card').first()).toBeVisible()
  await page.getByText('Record stack test').first().click()
  const today = new Date().toISOString().slice(0, 10)
  await page.getByTestId('stack-test-date').fill(today)
  await page.getByTestId('stack-test-save').click()
  await expect(page.getByTestId('facility-card').first()).toContainText(today)
  await page.goto('/console/compliance')
  await expect(page.locator('[data-req="R-TKNH-0"]')).toHaveAttribute('data-state', 'pass')
})

test('WR3 open a batch, upload telemetry, samples, close, certificate, inputs', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/console/batches')
  await page.getByTestId('open-batch').click()
  await page.getByTestId('batch-code').fill(CODE)
  await page.getByTestId('batch-notes').fill('Eval lifecycle run')
  await page.getByTestId('open-batch-save').click()
  await expect(page.getByText('Eval lifecycle run')).toBeVisible()

  await page.goto(`/console/batches/${CODE}`)
  await expect(page.getByTestId('batch-status')).toHaveText('Open') // capitalized

  // Telemetry CSV: ramp, hold with a dip, cool.
  const rows = ['minute,temp_c']
  for (let m = 0; m <= 120; m++) {
    const t = m <= 25 ? 25 + (m / 25) * 530 : m >= 35 && m <= 40 ? 350 : m > 105 ? 550 - (m - 105) * 30 : 555
    rows.push(`${m},${t}`)
  }
  await page.getByTestId('telemetry-file').setInputFiles({
    name: 'run.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(rows.join('\n')),
  })
  await expect(page.getByTestId('temp-chart')).toBeVisible()
  await expect(page.getByTestId('anomaly-marker')).toBeVisible()

  await page.getByTestId('register-samples').click()
  await expect(page.getByText(`S-${CODE}-1`)).toBeVisible()

  await page.getByTestId('close-batch').click()
  await page.getByTestId('close-feedstock').fill('4000')
  await page.getByTestId('close-biochar').fill('1000')
  await page.getByTestId('close-moisture').fill('20')
  await page.getByTestId('close-duration').fill('120')
  await page.getByTestId('close-batch-save').click()
  await expect(page.getByTestId('batch-status')).toHaveText('Awaiting lab')

  await page.getByTestId('enter-certificate').click()
  await page.getByTestId('cert-lab').fill('Eval accredited laboratory')
  await page.getByTestId('cert-corg').fill('75')
  await page.getByTestId('cert-hcorg').fill('0.4')
  await page.getByTestId('cert-ocorg').fill('0.1')
  await page.getByTestId('cert-moisture').fill('20')
  await page.getByTestId('certificate-save').click()
  await expect(page.getByTestId('batch-status')).toHaveText('Sampled')

  await page.getByTestId('edit-ops').click()
  await page.getByTestId('ops-km').fill('70')
  await page.getByTestId('ops-mass').fill('1')
  await page.getByTestId('ops-kwh').fill('300')
  await page.getByTestId('ops-save').click()
  await expect(page.getByText('run inputs on file')).toBeVisible()

  await page.getByTestId('add-co-product').click()
  await page.getByTestId('cp-grade').fill('1')
  await page.getByTestId('cp-mass').fill('180')
  await page.getByTestId('cp-fate').fill('Wood vinegar for agriculture')
  await page.getByTestId('co-product-save').click()
  await expect(page.getByText('Bio-liquid 1')).toBeVisible()
})

test('WR4 the ledger computes from the entered values', async ({ page }) => {
  await page.goto(`/console/ledger/${CODE}`)
  // dry 0.8 t × 0.75 = 0.6 t C × 3.6644463 = 2.1986678 t gross
  const gross = Number(await page.getByTestId('ledger-gross').getAttribute('data-value'))
  expect(gross).toBeGreaterThan(2.19)
  expect(gross).toBeLessThan(2.21)
  const net = Number(await page.getByTestId('ledger-net-conservative').getAttribute('data-value'))
  expect(net).toBeGreaterThan(0)
  expect(net).toBeLessThan(gross)
})

test('WR5 dispatch and soil application close the loop', async ({ page }) => {
  await page.goto(`/console/batches/${CODE}`)
  await page.getByTestId('new-dispatch').click()
  await page.getByTestId('dispatch-to').fill('Eval bulk buyer')
  await page.getByTestId('dispatch-mass').fill('500')
  await page.getByTestId('dispatch-save').click()
  const dispatch = page.getByTestId('dispatch-row').filter({ hasText: 'Eval bulk buyer' })
  await expect(dispatch).toBeVisible()
  await expect(dispatch).toContainText('Awaiting application evidence')

  await dispatch.getByText('Record application').click()
  await page.getByTestId('app-farm').fill('Eval farm cluster')
  await page.getByTestId('app-area').fill('1.2')
  await page.getByTestId('app-mass').fill('500')
  await page.getByTestId('application-save').click()
  await expect(page.getByTestId('application-row').filter({ hasText: 'Eval farm cluster' })).toBeVisible()
})

test('WR6 the new batch shows up in certify submissions when submitted', async ({ page }) => {
  await page.goto('/console/certify')
  await expect(page.getByTestId('certify-payload')).toContainText('production_batch')
  await page.getByTestId('certify-submit').click()
  await expect(page.getByTestId('submission-row').first()).toBeVisible()
})
