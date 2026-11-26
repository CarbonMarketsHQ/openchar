/** Batch and monthly reports: printable pages and Excel workbooks with the same figures. */
import { expect, test } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { SEED, login } from './helpers'

const sheetNames = (bytes: Buffer) => {
  const wb = strFromU8(unzipSync(new Uint8Array(bytes))['xl/workbook.xml'])
  return [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])
}

test('REP1 a batch report shows the ledger and evidence, and its workbook carries the same figures', async ({ context, page }) => {
  await login(context, page.request)
  await page.goto(`/console/batches/${SEED.batches.sampled}`)
  await page.getByTestId('batch-report-link').click()
  const report = page.getByTestId('batch-report')
  await expect(report).toContainText(`Batch ${SEED.batches.sampled}`)
  // The verified ledger: 2.930 t gross, 1.841 t conservative.
  await expect(report.getByTestId('report-ledger')).toContainText('2.930 t CO2e')
  await expect(report.getByTestId('report-ledger')).toContainText('1.841 t CO2e')
  await expect(report).toContainText('Trial batch HT-02 lab certificate (demo)')
  await expect(page.getByTestId('report-print')).toBeVisible()

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-xlsx').click()])
  expect(download.suggestedFilename()).toBe(`openchar-batch-${SEED.batches.sampled}.xlsx`)
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  const bytes = readFileSync(path!)
  expect(sheetNames(bytes)).toEqual(
    expect.arrayContaining(['Summary', 'Ledger', 'Datapoints', 'Lots', 'Consignments', 'Temperatures', 'Lab', 'Fuel'])
  )
  const summary = strFromU8(unzipSync(new Uint8Array(bytes))['xl/worksheets/sheet1.xml'])
  expect(summary).toContain('Net removal, conservative (t CO2e)')
  expect(summary).toMatch(/<v>1\.841\d*<\/v>/)
})

test('REP2 a monthly report covers the month, as a page and a workbook', async ({ context, page }) => {
  await login(context, page.request)
  const month = new Date().toISOString().slice(0, 7)
  await page.goto('/console/reports')
  await page.getByTestId('report-month-row').first().getByRole('link').first().click()
  await expect(page.getByTestId('month-report')).toBeVisible()
  await expect(page.getByTestId('report-month-summary')).toContainText('Scope 1')
  const res = await page.request.get(`/api/oc/reports/month/${month}?format=xlsx`)
  expect(res.ok()).toBe(true)
  expect(sheetNames(await res.body())).toEqual(['Summary', 'Batches', 'Fuel', 'Shifts', 'Downtime', 'Calibrations'])
  expect((await page.request.get('/api/oc/reports/month/2026-13x')).status()).toBe(400)
})
