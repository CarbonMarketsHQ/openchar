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
 */
import { createResetToken, createWorkspaceWithAdmin, logAuthEvent, resetLink } from './auth.js'
import { migrate, pool } from './db.js'

const USAGE = `usage:
  admin reset-link <email>
  admin create-admin <email> <name> <workspace name>`

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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
