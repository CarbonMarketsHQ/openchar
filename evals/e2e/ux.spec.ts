/** Charter section 4 — U1 axe, U2 type floor, U3 keyboard, U4 responsive,
 * U8 icon distinctness, U9 status capitalization, BR1 CMHQ mark. */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { SEED, login, setTheme } from './helpers'

const AUDITED = [
  '/console/gate',
  `/console/batches/${SEED.batches.sampled}`,
  '/console/lab',
  `/console/ledger/${SEED.batches.sampled}`,
  '/console/compliance',
  '/console/facilities',
  '/public',
  '/login',
]

for (const theme of ['field', 'paper'] as const) {
  test(`U1 axe: no serious or critical violations (${theme})`, async ({ context, page }) => {
    test.setTimeout(150_000)
    await login(context, page.request)
    await setTheme(context, theme)
    for (const path of AUDITED) {
      await page.goto(path)
      await page.waitForLoadState('load')
      const results = await new AxeBuilder({ page }).analyze()
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(bad, `${path} (${theme}): ${bad.map((v) => v.id).join(', ')}`).toEqual([])
    }
  })
}

test('U2 type floor: no sentence below 13px outside stamps', async ({ context, page }) => {
  await login(context, page.request)
  for (const path of AUDITED) {
    await page.goto(path)
    const violations = await page.evaluate(() => {
      const bad: string[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim()
        if (!text || text.length < 2) continue
        const el = n.parentElement
        if (!el) continue
        if (el.closest('[data-stamp], .ui-badge, .ui-sidebar__grouphead, .ui-sidebar__brandtext, script, style')) continue
        let size = parseFloat(getComputedStyle(el).fontSize)
        const svg = el.closest('svg')
        if (svg) {
          const vb = svg.viewBox?.baseVal
          if (vb && vb.width > 0) size = size * (svg.getBoundingClientRect().width / vb.width)
        }
        if (size < 13) bad.push(`${size.toFixed(1)}px: ${text.slice(0, 40)}`)
      }
      return bad.slice(0, 10)
    })
    expect(violations, `${path}: ${violations.join(' | ')}`).toEqual([])
  }
})

test('U3 keyboard: focus visible along the gate form, Escape closes dialog', async ({ context, page }) => {
  await login(context, page.request)
  await page.goto('/console/gate')
  await page.getByTestId('gate-new-lot').focus()
  await expect(page.getByTestId('gate-new-lot')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('lot-consignment')).toBeVisible()
  await page.keyboard.press('Tab')
  const ringed = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return false
    const s = getComputedStyle(el)
    return s.outlineStyle !== 'none' || s.boxShadow !== 'none'
  })
  expect(ringed).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('lot-consignment')).toBeHidden()
})

test('U4 responsive: no horizontal scroll at 1280 and 1440; field app fits 390', async ({ context, page }) => {
  await login(context, page.request)
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 850 })
    for (const path of ['/console/gate', '/console/compliance', '/console/facilities', '/public']) {
      await page.goto(path)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow, `${path} at ${width}`).toBeLessThanOrEqual(1)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/field')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('U8 batches and field-app icons are distinct drawings', async ({ context, page }) => {
  await login(context, page.request)
  await page.goto('/console')
  const icons = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.ui-sidebar__item'))
    const pick = (label: string) =>
      rows
        .find((r) => r.textContent?.includes(label))
        ?.querySelector('svg')
        ?.innerHTML ?? null
    return { batches: pick('Batches'), field: pick('Field app'), lab: pick('Lab') }
  })
  expect(icons.batches).toBeTruthy()
  expect(icons.field).toBeTruthy()
  expect(icons.batches).not.toEqual(icons.field)
  expect(icons.batches).not.toEqual(icons.lab)
})

test('U9 status badges are capitalized, never raw slugs', async ({ context, page }) => {
  await login(context, page.request)
  for (const path of ['/console', '/console/gate', '/console/lab', `/console/batches/${SEED.batches.sampled}`]) {
    await page.goto(path)
    const bad = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.ui-badge'))
        .map((b) => b.textContent?.trim() ?? '')
        .filter((t) => t.length > 0 && /^[a-z]/.test(t))
        .slice(0, 5)
    })
    expect(bad, `${path}: ${bad.join(', ')}`).toEqual([])
  }
})

test('BR1 the CMHQ mark is the only mark: pages, favicon and install icons', async ({ context, page, request }) => {
  const sprout = '#50C099' // the brand green the CMHQ mark owns
  // Front door, before any session.
  for (const path of ['/login', '/signup', '/reset', '/public']) {
    await page.goto(path)
    const mark = page.locator('svg[data-brand="cmhq"]').first()
    await expect(mark, path).toBeVisible()
    expect(await mark.innerHTML()).toContain(sprout)
  }
  await expect(page.locator('link[rel="icon"][href*="icon.svg"]')).toHaveCount(1)
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)

  // Signed in: console sidebar and field app.
  await login(context, page.request)
  await page.goto('/console')
  await expect(page.locator('.ui-sidebar__mark svg[data-brand="cmhq"]')).toBeVisible()
  await expect(page.locator('.ui-sidebar__mark')).not.toContainText('◳')
  await page.goto('/field')
  await expect(page.locator('.field-head svg[data-brand="cmhq"]')).toBeVisible()

  // Icons load without a session (browsers fetch them from the login page);
  // the request fixture carries no cookies.
  const fresh = request
  const favicon = await fresh.get('/icon.svg')
  expect(favicon.ok()).toBe(true)
  expect(await favicon.text()).toContain(sprout)
  const manifest = await (await fresh.get('/manifest.webmanifest')).json()
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3)
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const res = await fresh.get(icon.src, { maxRedirects: 0 })
    expect(res.status(), icon.src).toBe(200)
    expect(res.headers()['content-type'], icon.src).toContain(icon.type.split('+')[0])
  }
})
