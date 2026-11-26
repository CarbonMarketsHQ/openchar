/** Charter W8 and the local half of D1 (noindex). */
import { expect, test } from '@playwright/test'

test('W8 public page: open, synthetic-badged, no console leaks, no farm coordinates', async ({ page }) => {
  const res = await page.goto('/public')
  expect(res!.ok()).toBe(true)
  await expect(page.getByTestId('public-badge')).toContainText(/synthetic/i)
  await expect(page.getByTestId('public-tonnes')).toBeVisible()
  const tonnes = Number(await page.getByTestId('public-tonnes').getAttribute('data-value'))
  expect(tonnes).toBeGreaterThan(0)
  await expect(page.getByTestId('public-batches')).toBeVisible()
  expect(await page.locator('a[href*="/console"]').count()).toBe(0)
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(/\d{1,2}\.\d{4,}\s*[,°]\s*\d{1,3}\.\d{4,}/)
})

test('D1(local) pages declare noindex', async ({ page }) => {
  for (const path of ['/public', '/login', '/signup']) {
    await page.goto(path)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  }
})
