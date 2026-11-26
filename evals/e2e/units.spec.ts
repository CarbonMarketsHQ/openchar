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
  // Custody events read as words, never as raw JSON.
  for (const text of await page.getByTestId('unit-event').allInnerTexts()) expect(text).not.toMatch(/[{}"]/)
  await page.goto(`/console/units/${u2}`)
  await expect(page.getByTestId('unit-event').last()).toContainText('At Eval farm')

  // And the batch page lists the fleet.
  await page.goto(`/console/batches/${SEED.batches.sampled}`)
  await expect(page.getByTestId('unit-row').first()).toBeVisible()
})

test('UN2 bio-liquid drums carry their own QR and custody chain, never more than the stream', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const batch = (await (await page.request.get(`${api}/batches/${SEED.batches.sampled}`, { headers: H })).json()) as {
    coProducts: { id: string; kind: string; grade: string; massKg: number }[]
  }
  const stream = batch.coProducts.find((c) => c.kind === 'bio-liquid' && c.grade === '1')!

  await page.goto(`/console/batches/${SEED.batches.sampled}`)
  const row = page.getByTestId('co-product-row').filter({ hasText: 'Bio-liquid 1' })
  await expect(row.getByTestId('co-product-packed')).toHaveText('Not in containers')
  await row.getByTestId('package-co-product').click()
  await page.getByTestId('package-kind').selectOption('drum')
  await page.getByTestId('package-count').fill('2')
  await page.getByTestId('package-mass').fill('100')
  await page.getByTestId('package-submit').click()
  await expect(row.getByTestId('co-product-packed')).toHaveText('2 containers, 200 kg')

  // 220 kg in the stream, 200 kg packed: a 30 kg drum is refused.
  const over = await page.request.post(`${api}/co-products/${stream.id}/units`, { headers: H, data: { count: 1, massKgEach: 30, kind: 'drum' } })
  expect(over.status()).toBe(400)
  expect(((await over.json()) as { error: string }).error).toContain('20 kg')

  const units = (await (await page.request.get(`${api}/units?batch=${SEED.batches.sampled}`, { headers: H })).json()) as {
    id: string
    material: string
    status: string
  }[]
  const drum = units.find((u) => u.material === 'bio-liquid')!
  const bag = units.find((u) => u.material === 'biochar' && u.status === 'in-storage')
  if (bag) {
    const mixed = await page.request.post(`${api}/units/merge`, { headers: H, data: { unitIds: [drum.id, bag.id] } })
    expect(mixed.status()).toBe(400)
  }

  await page.request.post(`${api}/units/${drum.id}/deliver`, { headers: H, data: { toName: 'Nakuru agro-dealer (demo)' } })
  await page.goto(`/console/units/${drum.id}`)
  await expect(page.getByTestId('unit-material')).toContainText('Bio-liquid, grade 1. Wood vinegar for agriculture')
  await expect(page.getByTestId('unit-qr')).toBeVisible()
  await expect(page.getByTestId('unit-event').first()).toContainText(`100 kg of bio-liquid grade 1 from batch ${SEED.batches.sampled}`)
  await expect(page.getByTestId('unit-event').last()).toContainText('To Nakuru agro-dealer (demo)')
})
