/**
 * Operator CLI, run next to the database (locally, or inside the api
 * container with `docker compose exec api npm run admin -- <command>`).
 *
 *   reset-link <email>
 *       Print a 30-minute password-reset link. For support, or for any
 *       server with no mailer configured.
 *   create-admin <email> <name> <workspace name>
 *       Create a workspace and its first admin, and print the link they
 *       use to choose a password. The web first-run screen does the same.
 *   import-workspace <file.zip>
 *       Load a workspace copy exported from another OpenChar server (Account,
 *       then Download a full copy). Prints a reset link for each person.
 */
import { createResetToken, createWorkspaceWithAdmin, logAuthEvent, resetLink } from './auth.js'
import { readFile } from 'node:fs/promises'
import { migrate, pool } from './db.js'
import { importWorkspaceArchive } from './export.js'

const USAGE = `usage:
  admin reset-link <email>
  admin create-admin <email> <name> <workspace name>
  admin import-workspace <file.zip>`

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  if (cmd === 'reset-link' && args[0]) {
    const { rows } = await pool.query(`SELECT id, email FROM users WHERE email = $1`, [args[0].toLowerCase().trim()])
    if (!rows[0]) {
      console.error(`no user with email ${args[0]}`)
      process.exit(1)
    }
    const raw = await createResetToken(rows[0].id)
    logAuthEvent('reset-link-issued-by-operator', { email: rows[0].email, userId: rows[0].id })
    console.log(resetLink(raw))
  } else if (cmd === 'import-workspace' && args[0]) {
    await migrate()
    const result = await importWorkspaceArchive(new Uint8Array(await readFile(args[0])))
    console.log(`imported workspace "${result.workspace.name}" (${result.workspace.id})`)
    for (const [t, n] of Object.entries(result.tables)) if (n) console.log(`  ${t.padEnd(20)} ${n}`)
    console.log(`  ${'files'.padEnd(20)} ${result.files}`)
    for (const [p, ok] of Object.entries(result.chains)) {
      console.log(`field log for ${p}: ${ok ? 'hash chain intact' : 'HASH CHAIN BROKEN'}`)
    }
    console.log('\nPasswords are not part of a copy. Each person sets one from a reset link:')
    for (const email of result.users) {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email])
      const raw = await createResetToken(rows[0].id, 7 * 24 * 60 * 60 * 1000)
      console.log(`  ${email}  ${resetLink(raw, { invite: true })}`)
    }
  } else if (cmd === 'create-admin' && args.length >= 3) {
    await migrate()
    const [email, name, ...ws] = args
    const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email.toLowerCase().trim()])
    if (exists.rows.length) {
      console.error(`an account with email ${email} already exists`)
      process.exit(1)
    }
    // A random password nobody sees; the admin sets their own from the link.
    const { userId } = await createWorkspaceWithAdmin({
      workspaceName: ws.join(' '),
      name,
      email,
      password: crypto.randomUUID(),
    })
    logAuthEvent('admin-created-by-operator', { email, userId })
    console.log(resetLink(await createResetToken(userId, 7 * 86400000), { invite: true }))
  } else {
    console.error(USAGE)
    process.exit(1)
  }
  await pool.end()
}

main().catch(async (err) => {
  console.error(err instanceof Error && !process.env.DEBUG ? `error: ${err.message}` : err)
  process.exitCode = 1
  await pool.end().catch(() => {})
})
