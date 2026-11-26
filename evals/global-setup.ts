import { execSync } from 'node:child_process'

/** Bring the eval database up and seed it deterministically. */
export default async function globalSetup() {
  const root = process.cwd()
  execSync('docker compose up -d db', { cwd: root, stdio: 'inherit' })
  // Wait for Postgres to accept connections.
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      execSync('docker compose exec -T db pg_isready -U biochar -d biochar', { cwd: root, stdio: 'pipe' })
      break
    } catch {
      if (Date.now() > deadline) throw new Error('Postgres did not come up within 30s')
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  execSync('npm run seed -w server', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'postgres://biochar:biochar@localhost:5466/biochar', SEED_FORCE: '1' },
  })
}
