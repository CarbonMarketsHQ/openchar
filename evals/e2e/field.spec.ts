/** Charter W1 — offline-first field capture at phone width, with a photo
 * that becomes an evidence record on sync. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

test.use({ viewport: { width: 390, height: 844 } })

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

test('W1 capture offline with a photo, survive reload, sync when back online', async ({ context, page }) => {
  const token = await login(context, page.request)
  await page.goto('/field')
  await expect(page.getByTestId('field-capture')).toBeVisible()
  await page.waitForSelector('[data-offline-ready="true"]', { timeout: 20_000 })

  await context.setOffline(true)

  await page.getByTestId('field-supplier').selectOption({ label: SEED.suppliers[0] })
  await page.getByTestId('field-mass').fill('412')
  await page.getByTestId('field-moisture').fill('21')
  await page.getByTestId('field-category').selectOption('crop-residue')
  await page.getByTestId('field-gps').click()
  await page.getByTestId('field-photo-input').setInputFiles({ name: 'pile.png', mimeType: 'image/png', buffer: PIXEL })
  await expect(page.getByTestId('field-photo')).toContainText('Photo attached')
  await page.getByTestId('field-capture').click()

  const item = page.getByTestId('outbox-item').first()
  await expect(item).toBeVisible()
  await expect(item.getByTestId('outbox-state')).toHaveText(/sync pending/i)
  await expect(item.getByTestId('field-timestamp')).toHaveText(/\d{2}:\d{2}/)
  await expect(item).toContainText('Photo held locally')

  // R-8W08-0: the record survives an offline reload.
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined)
  await expect(page.getByTestId('outbox-item').first()).toBeVisible()

  await context.setOffline(false)
  await page.getByTestId('field-sync').click()
  await expect(page.getByTestId('outbox-item')).toHaveCount(0, { timeout: 20_000 })

  // The consignment is on the server with a real photo evidence record.
  const res = await page.request.get(`${SEED.apiUrl}/consignments?state=received`, {
    headers: apiHeaders(token),
  })
  const consignments = await res.json()
  const mine = consignments.find((c: { estMassKg: number }) => c.estMassKg === 412)
  expect(mine).toBeDefined()
  expect(mine.supplierName).toBe(SEED.suppliers[0])
  expect(mine.photoRef).toMatch(/^src_/)
  const file = await page.request.get(`${SEED.apiUrl}/sources/${mine.photoRef}/file`, {
    headers: apiHeaders(token),
  })
  expect(file.ok()).toBe(true)
})
