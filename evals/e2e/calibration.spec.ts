/** The calibration register: due dates, lapses, and the alerts before them. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

test('CAL1 a lapsed instrument shows everywhere it matters, and recording a calibration clears it', async ({ context, page }) => {
  await login(context, page.request)

  // The overview warns before anyone opens the register.
  await page.goto('/console')
  await expect(page.getByTestId('calibration-notice')).toContainText('Feedstock moisture meter lapsed')
  await expect(page.getByTestId('calibration-notice')).toContainText('Loading hopper scale is due in')

  await page.goto('/console/calibration')
  const meter = page.getByTestId('instrument-row').filter({ hasText: 'Feedstock moisture meter' })
  await expect(meter.getByTestId('instrument-state')).toHaveText('Lapsed')
  await expect(page.getByTestId('instrument-row').first()).toHaveAttribute('data-state', 'overdue')
  await expect(page.getByTestId('instrument-row').filter({ hasText: 'Loading hopper scale' }).getByTestId('instrument-state')).toHaveText('Due soon')

  // Compliance names it too.
  await page.goto('/console/compliance')
  await expect(page.getByTestId('compliance-table')).toContainText('out of calibration: Feedstock moisture meter')

  await page.goto('/console/calibration')
  await meter.getByTestId('record-calibration').click()
  await page.getByTestId('calibration-result').selectOption('adjusted')
  await page.getByTestId('calibration-by').fill('Supplier service centre (demo)')
  await page.getByTestId('calibration-submit').click()
  await expect(meter.getByTestId('instrument-state')).toHaveText('In calibration')
  // A 90-day interval from today.
  await expect(meter.getByTestId('instrument-due')).toHaveText(/in (89|90|91) days/)

  await page.goto('/console')
  await expect(page.getByTestId('calibration-notice')).not.toContainText('moisture meter')
  await page.goto('/console/compliance')
  await expect(page.getByTestId('compliance-table')).toContainText('All 5 instruments are in calibration')
})

test('CAL2 a new instrument starts uncalibrated; impossible calibrations are refused', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)

  await page.goto('/console/calibration')
  await page.getByTestId('add-instrument').click()
  await page.getByTestId('instrument-name').fill('Diesel flow meter')
  await page.getByTestId('instrument-kind').selectOption('flow-meter')
  await page.getByTestId('instrument-interval').fill('365')
  await page.getByTestId('instrument-submit').click()
  const row = page.getByTestId('instrument-row').filter({ hasText: 'Diesel flow meter' })
  await expect(row.getByTestId('instrument-state')).toHaveText('Never calibrated')

  const list = (await (await page.request.get(`${api}/instruments`, { headers: H })).json()) as { instruments: { id: string; name: string }[] }
  const id = list.instruments.find((i) => i.name === 'Diesel flow meter')!.id
  const cal = (data: object) => page.request.post(`${api}/instruments/${id}/calibrations`, { headers: H, data })

  expect((await page.request.post(`${api}/instruments`, { headers: H, data: { name: 'X', kind: 'barometer', intervalDays: 30 } })).status()).toBe(400)
  expect((await page.request.post(`${api}/instruments`, { headers: H, data: { name: 'X', kind: 'scale', intervalDays: 0 } })).status()).toBe(400)
  expect((await cal({ calibratedOn: day(5), result: 'pass', performedBy: 'Lab' })).status()).toBe(400)
  expect((await cal({ calibratedOn: day(0), result: 'maybe', performedBy: 'Lab' })).status()).toBe(400)
  expect((await cal({ calibratedOn: day(0), result: 'pass', performedBy: 'Lab', nextDue: day(-1) })).status()).toBe(400)
  expect((await cal({ calibratedOn: day(0), result: 'pass', performedBy: 'Lab', sourceId: 'src-nope' })).status()).toBe(404)

  // A certificate that sets its own next date overrides the interval.
  const ok = await cal({ calibratedOn: day(0), result: 'pass', performedBy: 'Lab', nextDue: day(20), sourceId: 'src-hopper-cal' })
  expect(ok.ok()).toBe(true)
  expect(((await ok.json()) as { nextDue: string }).nextDue).toBe(day(20))
  await page.reload()
  await expect(row.getByTestId('instrument-state')).toHaveText('Due soon')

  // A failed calibration takes the instrument out of use, whatever the date.
  await cal({ calibratedOn: day(0), result: 'fail', performedBy: 'Lab' })
  await page.reload()
  await expect(row.getByTestId('instrument-state')).toHaveText('Failed')
})
