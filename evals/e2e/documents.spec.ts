/** Documents by type, attached to the consignments, lots and batches they
 * support, stored under their SHA-256 hash. */
import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { SEED, apiHeaders, login } from './helpers'

const api = SEED.apiUrl
const pdf = (text: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% ${text}\ntrailer << /Root 1 0 R >>\n%%EOF\n`)

test('DOC1 upload a supplier declaration to a consignment from the console, then download the same bytes', async ({
  context,
  page,
}) => {
  await login(context, page.request)
  await page.goto('/console/documents')
  // The seeded slip and certificate are listed with the records they already support.
  const slip = page.getByTestId('doc-row').filter({ hasText: 'Weighbridge slip 4411 (demo)' })
  await expect(slip.getByTestId('doc-type-badge')).toHaveText('Weighbridge slip')
  await expect(slip.getByTestId('doc-link')).toHaveCount(3)
  const cert = page.getByTestId('doc-row').filter({ hasText: 'Trial batch HT-02 lab certificate (demo)' })
  await expect(cert.getByTestId('doc-link').first()).toContainText(SEED.batches.sampled)

  const body = pdf(`declaration ${Date.now()}`)
  await page.getByTestId('add-document').click()
  await page.getByTestId('doc-type').selectOption('supplier-declaration')
  await page.getByTestId('doc-file').setInputFiles({ name: 'bahati-declaration.pdf', mimeType: 'application/pdf', buffer: body })
  await expect(page.getByTestId('doc-file-name')).toContainText('bahati-declaration.pdf')
  await page.getByTestId('doc-record').selectOption('consignment:CN-001')
  await page.getByTestId('doc-submit').click()

  const row = page.getByTestId('doc-row').filter({ hasText: 'bahati-declaration.pdf' })
  await expect(row).toBeVisible()
  await expect(row.getByTestId('doc-type-badge')).toHaveText('Supplier declaration')
  await expect(row.getByTestId('doc-link')).toContainText('CN-001')

  // The file comes back byte for byte, and the hash shown is its SHA-256.
  const sha = createHash('sha256').update(body).digest('hex')
  await expect(row).toContainText(sha.slice(0, 12))
  const href = await row.getByTestId('doc-download').getAttribute('href')
  const res = await page.request.get(href!)
  expect(res.ok()).toBe(true)
  expect(createHash('sha256').update(await res.body()).digest('hex')).toBe(sha)

  // Filtering by type and by record.
  await page.getByTestId('doc-filter-supplier-declaration').click()
  await expect(page.getByTestId('doc-row')).toHaveCount(1)
  await page.goto('/console/documents?record=consignment:CN-001')
  await expect(page.getByTestId('doc-row')).toHaveCount(1)
})

test('DOC2 a batch shows its documents; attaching validates type and record', async ({ context, page }) => {
  const token = await login(context, page.request)
  const H = apiHeaders(token)
  const batch = SEED.batches.sampled

  const upload = (fields: Record<string, string>) =>
    page.request.post(`${api}/documents`, {
      headers: H,
      multipart: { ...fields, file: { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: pdf(`invoice ${Date.now()}`) } },
    })

  expect((await upload({ type: 'receipt' })).status()).toBe(400)
  expect((await upload({ type: 'invoice', recordKind: 'batch', recordId: 'HT-99' })).status()).toBe(404)
  const ok = await upload({ type: 'invoice', title: 'Feedstock transport invoice', recordKind: 'batch', recordId: batch })
  expect(ok.ok()).toBe(true)
  const { id } = (await ok.json()) as { id: string }

  // One document, several records.
  const lots = (await (await page.request.get(`${api}/lots`, { headers: H })).json()) as { id: string }[]
  expect((await page.request.post(`${api}/documents/${id}/links`, { headers: H, data: { kind: 'lot', id: lots[0].id } })).ok()).toBe(true)
  expect((await page.request.post(`${api}/documents/${id}/links`, { headers: H, data: { kind: 'lot', id: 'L-404' } })).status()).toBe(404)

  await page.goto(`/console/batches/${batch}`)
  const card = page.getByTestId('batch-documents')
  // The lab certificate the seed already links, plus the new invoice.
  await expect(card).toContainText('Feedstock transport invoice')
  await expect(card).toContainText('Lab certificate')

  // The evidence page names every record the document supports.
  await page.goto(`/console/sources/${id}`)
  await expect(page.getByTestId('source-links')).toContainText(batch)
  await expect(page.getByTestId('source-links')).toContainText(lots[0].id)
})
