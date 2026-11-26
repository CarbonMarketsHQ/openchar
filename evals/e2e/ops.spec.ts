/** Charter section 6 — operations an admin can see without shell access. */
import { expect, test } from '@playwright/test'
import { Client } from 'pg'
import { SEED, login } from './helpers'

test('B1 backup freshness: none on record warns, a recent run reads fresh', async ({ context, page }) => {
  const db = new Client({ connectionString: SEED.dbUrl })
  await db.connect()
  try {
    await db.query(`DELETE FROM backup_runs`)
    await login(context, page.request)
    await page.goto('/console/account')
    const status = page.getByTestId('backup-status')
    await expect(status).toHaveAttribute('data-state', 'stale')
    await expect(status).toContainText(/No backup on record/)

    // What backup.sh records after a good night.
    await db.query(`INSERT INTO backup_runs (at, db_bytes, files_bytes, offsite) VALUES (now() - interval '3 hours', 8277, 512, true)`)
    await page.reload()
    await expect(status).toHaveAttribute('data-state', 'fresh')
    await expect(status).toContainText(/3 hours ago, copied offsite/)

    // A run that is a night late says so.
    await db.query(`UPDATE backup_runs SET at = now() - interval '30 hours'`)
    await page.reload()
    await expect(status).toHaveAttribute('data-state', 'late')
  } finally {
    await db.end()
  }
})
