/** Unit-level chain of custody: create, split, merge, deliver, apply, and
 * the lineage a QR scan lands on. */
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl

test('UN1 package, split, merge: mass balances and lineage holds', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)

  const created = await (
    await page.request.post(`${api}/batches/${SEED.batches.sampled}/units`, {
      headers: H,
      data: { count: 2, massKgEach: 300, kind: 'bag' },
    })
  ).json()
  expect(created.created.length).toBe(2)
  const [u1, u2] = created.created as string[]

  // A split that does not balance is refused.
  const bad = await page.request.post(`${api}/units/${u1}/split`, { headers: H, data: { masses: [100, 100] } })
  expect(bad.status()).toBe(400)

  const split = await (
    await page.request.post(`${api}/units/${u1}/split`, { headers: H, data: { masses: [150, 150] } })
  ).json()
  expect(split.created.length).toBe(2)
  const [c1, c2] = split.created as string[]

  const merged = await (
    await page.request.post(`${api}/units/merge`, { headers: H, data: { unitIds: [c1, c2] } })
  ).json()
  expect(merged.id).toBeTruthy()

  const lineage = await (await page.request.get(`${api}/units/${merged.id}`, { headers: H })).json()
  expect(lineage.massKg).toBe(300)
  expect(lineage.parents.map((p: { id: string }) => p.id).sort()).toEqual([c1, c2].sort())
  expect(lineage.originBatch).toBe(SEED.batches.sampled)
  const parent = await (await page.request.get(`${api}/units/${u1}`, { headers: H })).json()
  expect(parent.status).toBe('split')
  expect(parent.children.sort()).toEqual([c1, c2].sort())

  // Custody closes out: deliver then apply the second unit.
  await page.request.post(`${api}/units/${u2}/deliver`, { headers: H, data: { toName: 'Eval buyer' } })
  await page.request.post(`${api}/units/${u2}/apply`, { headers: H, data: { farmName: 'Eval farm' } })
  const closed = await (await page.request.get(`${api}/units/${u2}`, { headers: H })).json()
  expect(closed.status).toBe('applied')
  expect(closed.events.map((e: { kind: string }) => e.kind)).toEqual(['created', 'delivered', 'applied'])

  // The page a QR scan lands on: label, lineage, events.
  await page.goto(`/console/units/${merged.id}`)
  await expect(page.getByTestId('unit-qr')).toBeVisible()
  await expect(page.getByTestId('unit-status')).toHaveText('In storage')
  await expect(page.getByTestId('unit-parents')).toContainText(c1)
  await expect(page.getByTestId('unit-origin')).toHaveText(SEED.batches.sampled)
  await expect(page.getByTestId('unit-event').first()).toBeVisible()

  // And the batch page lists the fleet.
  await page.goto(`/console/batches/${SEED.batches.sampled}`)
  await expect(page.getByTestId('unit-row').first()).toBeVisible()
})
