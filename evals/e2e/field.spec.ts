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
  // At phone width the offline status must not push the title onto two lines.
  await page.setViewportSize({ width: 393, height: 852 })
  await expect(page.getByTestId('field-status')).toHaveText('Offline, saving here')
  const title = await page.locator('.field-head h1').boundingBox()
  expect(title!.height).toBeLessThan(40)

  await page.getByTestId('field-supplier').selectOption({ label: SEED.suppliers[0] })
  await page.getByTestId('field-mass').fill('412')
  await page.getByTestId('field-moisture').fill('21')
  await page.getByTestId('field-category').selectOption('crop-residue')
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: -0.2, longitude: 36.1 })
  await page.getByTestId('field-gps').click()
  await expect(page.getByTestId('field-gps')).toContainText('GPS fixed')
  await expect(page.getByTestId('field-gps-fix')).toContainText('-0.2000, 36.1000')
  await page.getByTestId('field-photo-input').setInputFiles({ name: 'pile.png', mimeType: 'image/png', buffer: PIXEL })
  await expect(page.getByTestId('field-photo')).toContainText('Retake photo')
  await page.getByTestId('field-capture').click()

  const item = page.getByTestId('outbox-item').first()
  await expect(item).toBeVisible()
  await expect(item.getByTestId('outbox-state')).toHaveText(/sync pending/i)
  await expect(item.getByTestId('field-timestamp')).toHaveText(/\d{2}:\d{2}/)
  await expect(item).toContainText('Photo')

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

test('W2 soil application offline: walked boundary, photo, signed declaration, synced with its evidence', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const made = await page.request.post(`${SEED.apiUrl}/dispatches`, {
    headers: H,
    data: { batchCode: SEED.batches.sampled, toName: 'Rongai smallholder (eval)', massKg: 300 },
  })
  expect(made.ok()).toBe(true)

  await page.setViewportSize({ width: 393, height: 852 })
  await context.grantPermissions(['geolocation'])
  const corner = { lat: -0.2, lng: 36.1 }
  await context.setGeolocation({ latitude: corner.lat, longitude: corner.lng })
  await page.goto('/field/apply')
  await expect(page.getByTestId('apply-dispatch')).toContainText('Rongai smallholder (eval)')
  await page.getByTestId('apply-dispatch').selectOption({ label: `${SEED.batches.sampled} to Rongai smallholder (eval), 300 kg left` })
  await page.getByTestId('apply-farm').fill('Kiptoo plot 3 (eval)')
  await page.getByTestId('apply-mass').fill('300')

  // Walk a square about 100 m on a side: close to one hectare.
  await page.getByTestId('apply-walk').click()
  const d = 0.0009
  for (const [dl, dg] of [[0, 0], [d, 0], [d, d], [0, d]]) {
    await context.setGeolocation({ latitude: corner.lat + dl, longitude: corner.lng + dg })
    await page.waitForTimeout(400)
  }
  await page.getByTestId('apply-walk').click()
  await expect(page.getByTestId('boundary-summary')).toHaveText(/^4 points, 1\.0\d ha$/)

  await page.getByTestId('apply-gps').click()
  await expect(page.getByTestId('apply-gps')).toContainText('GPS fixed')
  await page.getByTestId('apply-photo-input').setInputFiles({ name: 'field.png', mimeType: 'image/png', buffer: PIXEL })
  await expect(page.getByTestId('apply-thumbs').locator('img')).toHaveCount(1)
  await page.getByTestId('apply-declarant').fill('Joseph Kiptoo (eval)')
  await page.getByTestId('apply-confirm').check()
  const pad = await page.getByTestId('apply-signature').boundingBox()
  await page.mouse.move(pad!.x + 20, pad!.y + 30)
  await page.mouse.down()
  await page.mouse.move(pad!.x + 120, pad!.y + 80, { steps: 8 })
  await page.mouse.move(pad!.x + 220, pad!.y + 40, { steps: 8 })
  await page.mouse.up()

  await context.setOffline(true)
  await page.getByTestId('apply-capture').click()
  await expect(page.getByTestId('apply-outbox-item')).toHaveCount(1)
  await expect(page.getByTestId('apply-status')).toHaveText('Offline, saving here')

  await context.setOffline(false)
  await page.getByTestId('apply-sync').click()
  await expect(page.getByTestId('apply-outbox-item')).toHaveCount(0)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/console/batches/${SEED.batches.sampled}`)
  const row = page.getByTestId('application-row').filter({ hasText: 'Kiptoo plot 3 (eval)' })
  await expect(row.getByTestId('application-evidence')).toContainText('boundary walked, 4 points')
  await expect(row.getByTestId('application-evidence')).toContainText('1 photo')
  await expect(row.getByTestId('application-evidence')).toContainText('signed by Joseph Kiptoo (eval)')
})
