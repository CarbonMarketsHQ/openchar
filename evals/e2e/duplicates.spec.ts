/** Possible duplicates: a consignment captured twice, a slip used twice, a file uploaded twice. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl

test('DUP1 a consignment captured twice is flagged until a person decides; a slip used twice is flagged', async ({
  context,
  page,
}) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const suppliers = (await (await page.request.get(`${api}/suppliers`, { headers: H })).json()) as { id: string; name: string }[]
  const supplier = suppliers.find((s) => s.name === SEED.suppliers[2])!
  const stamp = Date.now()
  const event = (n: number, minutesAgo: number, kg: number) => ({
    id: `evt-dup-${stamp}-${n}`,
    kind: 'consignment-captured',
    capturedAt: new Date(stamp - minutesAgo * 60000).toISOString(),
    deviceId: 'eval-device',
    payload: { consignmentId: `CN-DUP-${stamp}-${n}`, supplierId: supplier.id, estMassKg: kg, moistureFrac: 0.2, category: 'crop-residue' },
  })
  const sync = await page.request.post(`${api}/sync`, { headers: H, data: { events: [event(1, 20, 500), event(2, 10, 503)] } })
  expect(sync.ok()).toBe(true)
  const [a, b] = [`CN-DUP-${stamp}-1`, `CN-DUP-${stamp}-2`]

  await page.goto('/console/gate')
  const item = page.getByTestId('duplicate-item').filter({ hasText: a })
  await expect(item).toContainText(b)
  await expect(item).toContainText('10 minutes apart')
  await expect(page.locator(`#consignment-${a}`).getByTestId('duplicate-badge')).toBeVisible()
  await page.goto('/console/compliance')
  await expect(page.locator('[data-req="SITE-DUPLICATES"]')).toContainText('Warn')

  // A person looks and decides they are two real loads.
  await page.goto('/console/gate')
  await item.getByTestId('not-duplicate').click()
  await expect(page.getByTestId('duplicate-item').filter({ hasText: a })).toHaveCount(0)
  await expect(page.locator(`#consignment-${a}`).getByTestId('duplicate-badge')).toHaveCount(0)

  // One slip recorded for a second lot is flagged too, and a slip from elsewhere is refused.
  expect(
    (await page.request.post(`${api}/lots`, { headers: H, data: { consignmentId: a, weighbridgeSlipKg: 496, moistureFrac: 0.2, slipSourceId: 'src-nope' } })).status()
  ).toBe(404)
  const lot = await page.request.post(`${api}/lots`, {
    headers: H,
    data: { consignmentId: a, weighbridgeSlipKg: 496, moistureFrac: 0.2, slipSourceId: 'src-slip-001' },
  })
  expect(lot.ok()).toBe(true)
  await page.reload()
  await expect(page.getByTestId('duplicate-item').filter({ hasText: 'Weighbridge slip 4411 (demo)' })).toContainText('2 lots')
})

test('DUP2 the same file uploaded twice is flagged on both copies', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const body = Buffer.from(`%PDF-1.4 the same invoice ${Date.now()}`)
  const up = (title: string) =>
    page.request.post(`${api}/documents`, {
      headers: H,
      multipart: { type: 'invoice', title, file: { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: body } },
    })
  const first = (await (await up('Haulage invoice 77')).json()) as { id: string; duplicateOf: unknown[] }
  expect(first.duplicateOf).toEqual([])
  const second = (await (await up('Haulage invoice 77, again')).json()) as { duplicateOf: { id: string }[] }
  expect(second.duplicateOf.map((d) => d.id)).toEqual([first.id])

  await page.goto('/console/documents?type=invoice')
  for (const t of ['Haulage invoice 77', 'Haulage invoice 77, again']) {
    await expect(page.getByTestId('doc-row').filter({ hasText: t }).first().getByTestId('doc-same-file')).toBeVisible()
  }
  await page.getByTestId('doc-row').filter({ hasText: 'Haulage invoice 77, again' }).getByTestId('not-duplicate').click()
  await expect(page.getByTestId('doc-row').filter({ hasText: 'Haulage invoice 77' }).first().getByTestId('doc-same-file')).toHaveCount(0)
})
