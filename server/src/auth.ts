/** Users, sessions, workspaces. Scrypt for passwords (no extra dependency),
 * opaque session tokens with a 30-day ttl, workspace-scoped everything. */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { newId, pool } from './db.js'
import { mailConfigured, sendMail } from './mail.js'

const SESSION_TTL_MS = 30 * 86400000

const digest = (s: string) => createHash('sha256').update(s).digest()

/** The service token check. API_TOKEN_PREVIOUS is honoured too, so a
 * rotation can update the web tier after the API without a 401 window. */
export function hasServiceToken(req: FastifyRequest): boolean {
  const header = req.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  const presented = digest(header.slice(7))
  return [process.env.API_TOKEN, process.env.API_TOKEN_PREVIOUS]
    .filter((t): t is string => !!t)
    .some((t) => timingSafeEqual(presented, digest(t)))
}

/** The person's address, not the web server's. The web app relays it in
 * X-Client-IP; that header is believed only alongside the service token,
 * so nobody else can choose the key their rate limit is counted under. */
export function clientIp(req: FastifyRequest): string {
  const relayed = req.headers['x-client-ip']
  if (typeof relayed === 'string' && isIP(relayed) && hasServiceToken(req)) return relayed
  return req.ip
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export type SessionUser = {
  id: string
  email: string
  name: string
  role: string
  workspaceId: string
  workspaceName: string
}

export async function resolveSession(token: string): Promise<SessionUser | null> {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.workspace_id, w.name AS workspace_name
     FROM sessions s JOIN users u ON u.id = s.user_id JOIN workspaces w ON w.id = u.workspace_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
  }
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await pool.query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`, [
    token,
    userId,
    new Date(Date.now() + SESSION_TTL_MS),
  ])
  return token
}

export async function createWorkspaceWithAdmin(input: {
  workspaceName: string
  name: string
  email: string
  password: string
  workspaceId?: string
  userId?: string
}): Promise<{ workspaceId: string; userId: string }> {
  const workspaceId = input.workspaceId ?? newId('ws')
  const userId = input.userId ?? newId('usr')
  await pool.query(`INSERT INTO workspaces (id, name) VALUES ($1, $2)`, [workspaceId, input.workspaceName])
  await pool.query(
    `INSERT INTO users (id, workspace_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, 'admin', $5)`,
    [userId, workspaceId, input.email.toLowerCase().trim(), input.name, hashPassword(input.password)]
  )
  return { workspaceId, userId }
}

/** Fire-and-forget audit trail for authentication events. */
export function logAuthEvent(kind: string, opts: { email?: string; userId?: string; ip?: string } = {}) {
  void pool
    .query(`INSERT INTO auth_events (kind, email, user_id, ip) VALUES ($1, $2, $3, $4)`, [
      kind,
      opts.email?.toLowerCase().trim() ?? null,
      opts.userId ?? null,
      opts.ip ?? null,
    ])
    .catch(() => undefined)
}

const RESET_TTL_MS = 30 * 60000
const INVITE_TTL_MS = 7 * 86400000

/** A password that can never match: invited users have one until they
 * choose their own through the invite link. */
const NO_PASSWORD = '!'

/** Create a reset token for a user; returns the raw token (stored hashed). */
export async function createResetToken(userId: string, ttlMs = RESET_TTL_MS): Promise<string> {
  const raw = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(raw).digest('hex')
  await pool.query(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [
    hash,
    userId,
    new Date(Date.now() + ttlMs),
  ])
  return raw
}

export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export function resetLink(rawToken: string, opts: { invite?: boolean } = {}): string {
  return `${appUrl()}/reset?token=${rawToken}${opts.invite ? '&invite=1' : ''}`
}

/** 'closed' (default): only the first account can be created this way, the
 * one that sets the server up; everyone else is invited by an admin.
 * 'open': anyone who can reach the server can create a workspace. */
export function signupMode(): 'open' | 'closed' {
  return process.env.SIGNUP_MODE === 'open' ? 'open' : 'closed'
}

async function userCount(): Promise<number> {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM users`)
  return rows[0].n
}

/** Create a teammate with no usable password and send them a link to
 * choose one. Returns the link too, so an admin can pass it on by hand
 * when no mailer is configured. */
export async function inviteUser(input: {
  workspaceId: string
  workspaceName: string
  email: string
  name: string
  role: string
  invitedBy: string
}): Promise<{ id: string; inviteLink: string }> {
  const id = newId('usr')
  const email = input.email.toLowerCase().trim()
  await pool.query(
    `INSERT INTO users (id, workspace_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.workspaceId, email, input.name, input.role, NO_PASSWORD]
  )
  const inviteLink = resetLink(await createResetToken(id, INVITE_TTL_MS), { invite: true })
  await sendMail({
    to: email,
    subject: `${input.invitedBy} invited you to ${input.workspaceName} on OpenChar`,
    text:
      `${input.invitedBy} added you to the ${input.workspaceName} workspace on OpenChar.\n\n` +
      `Choose a password to sign in (the link works for 7 days):\n${inviteLink}\n`,
    link: inviteLink,
  })
  return { id, inviteLink }
}

const AUTH_RATE = {
  config: {
    rateLimit: { max: Number(process.env.AUTH_RATE_MAX || 15), timeWindow: '1 minute' },
  },
}

export function registerAuthRoutes(app: FastifyInstance) {
  // What the sign-in screens need to know before anyone is signed in.
  app.get('/auth/config', async () => {
    const setupRequired = (await userCount()) === 0
    const mode = signupMode()
    return {
      setupRequired,
      signup: mode,
      // An extension can offer its own sign-up flow (the hosted service's
      // email-verified one) and point the sign-in screen at it.
      signupUrl: process.env.SIGNUP_URL || (mode === 'open' ? '/signup' : null),
      mailConfigured: mailConfigured(),
    }
  })

  app.post('/auth/signup', AUTH_RATE, async (req, reply) => {
    if (signupMode() === 'closed' && (await userCount()) > 0) {
      return reply.code(403).send({ error: 'sign-up is closed on this server; ask an admin to invite you' })
    }
    const b = req.body as { workspaceName?: string; name?: string; email?: string; password?: string }
    if (!b.workspaceName || !b.name || !b.email || !b.password) {
      return reply.code(400).send({ error: 'workspaceName, name, email and password are required' })
    }
    if (b.password.length < 10) {
      return reply.code(400).send({ error: 'password must be at least 10 characters' })
    }
    const existing = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [b.email.toLowerCase().trim()])
    if (existing.rows.length) return reply.code(409).send({ error: 'an account with this email already exists' })
    const { userId } = await createWorkspaceWithAdmin({
      workspaceName: b.workspaceName,
      name: b.name,
      email: b.email,
      password: b.password,
    })
    const token = await createSession(userId)
    logAuthEvent('signup', { email: b.email, userId, ip: clientIp(req) })
    return { token, user: await resolveSession(token) }
  })

  app.post('/auth/login', AUTH_RATE, async (req, reply) => {
    const b = req.body as { email?: string; password?: string }
    if (!b.email || !b.password) return reply.code(400).send({ error: 'email and password are required' })
    const { rows } = await pool.query(`SELECT id, password_hash FROM users WHERE email = $1`, [
      b.email.toLowerCase().trim(),
    ])
    const u = rows[0]
    if (!u || !checkPassword(b.password, u.password_hash)) {
      const email = b.email.toLowerCase().trim()
      await pool.query(`INSERT INTO auth_events (kind, email, ip) VALUES ('login-fail', $1, $2)`, [email, clientIp(req)])
      // In-app brute-force alert: five failures for one email inside
      // fifteen minutes files one alert on the workspace's trail.
      const fails = await pool.query(
        `SELECT count(*)::int AS n FROM auth_events
         WHERE kind = 'login-fail' AND email = $1 AND at > now() - interval '15 minutes'`,
        [email]
      )
      if (fails.rows[0].n >= 5) {
        const existing = await pool.query(
          `SELECT 1 FROM auth_events WHERE kind = 'alert-bruteforce' AND email = $1 AND at > now() - interval '15 minutes'`,
          [email]
        )
        if (!existing.rows.length) {
          await pool.query(`INSERT INTO auth_events (kind, email, ip) VALUES ('alert-bruteforce', $1, $2)`, [email, clientIp(req)])
        }
      }
      return reply.code(401).send({ error: 'wrong email or password' })
    }
    const token = await createSession(u.id)
    logAuthEvent('login-ok', { email: b.email, userId: u.id, ip: clientIp(req) })
    return { token, user: await resolveSession(token) }
  })

  app.post('/auth/request-reset', AUTH_RATE, async (req) => {
    const b = req.body as { email?: string }
    const email = b.email?.toLowerCase().trim()
    if (email) {
      const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email])
      if (rows[0]) {
        const raw = await createResetToken(rows[0].id)
        const link = resetLink(raw)
        logAuthEvent('reset-requested', { email, userId: rows[0].id, ip: clientIp(req) })
        // Without a mailer the link lands in the API log, and an operator can
        // also issue one: `npm run admin -- reset-link <email>`.
        void sendMail({
          to: email,
          subject: 'Reset your OpenChar password',
          text:
            `Someone asked to reset the password for ${email} on OpenChar.\n\n` +
            `Choose a new password here (the link works for 30 minutes):\n${link}\n\n` +
            `If that was not you, ignore this message. Your password stays as it is.\n`,
          link,
        })
      } else {
        logAuthEvent('reset-requested-unknown', { email, ip: clientIp(req) })
      }
    }
    // Always the same answer, so the endpoint cannot be used to probe emails.
    return { ok: true }
  })

  app.post('/auth/reset', AUTH_RATE, async (req, reply) => {
    const b = req.body as { token?: string; newPassword?: string }
    if (!b.token || !b.newPassword) return reply.code(400).send({ error: 'token and newPassword are required' })
    if (b.newPassword.length < 10) {
      return reply.code(400).send({ error: 'the new password must be at least 10 characters' })
    }
    const hash = createHash('sha256').update(b.token).digest('hex')
    const { rows } = await pool.query(
      `SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`,
      [hash]
    )
    if (!rows[0]) return reply.code(400).send({ error: 'this reset link is invalid or has expired' })
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hashPassword(b.newPassword), rows[0].user_id])
    await pool.query(`UPDATE password_resets SET used_at = now() WHERE token_hash = $1`, [hash])
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [rows[0].user_id])
    logAuthEvent('reset-complete', { email: rows[0].email, userId: rows[0].user_id, ip: clientIp(req) })
    return { ok: true }
  })

  app.get('/auth/users', async (req, reply) => {
    const user = (req as FastifyRequest & { user?: SessionUser }).user
    if (!user) return reply.code(401).send({ error: 'no session' })
    if (user.role !== 'admin') return reply.code(403).send({ error: 'admins only' })
    const { rows } = await pool.query(
      `SELECT id, email, name, role, created_at FROM users WHERE workspace_id = $1 ORDER BY created_at`,
      [user.workspaceId]
    )
    return rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at }))
  })

  app.post('/auth/users', AUTH_RATE, async (req, reply) => {
    const user = (req as FastifyRequest & { user?: SessionUser }).user
    if (!user) return reply.code(401).send({ error: 'no session' })
    if (user.role !== 'admin') return reply.code(403).send({ error: 'admins only' })
    const b = req.body as { email?: string; name?: string; role?: string; password?: string }
    if (!b.email || !b.name) {
      return reply.code(400).send({ error: 'email and name are required' })
    }
    if (!['admin', 'member', 'verifier'].includes(b.role ?? 'member')) {
      return reply.code(400).send({ error: 'role must be admin, member or verifier' })
    }
    if (b.password !== undefined && b.password !== '' && b.password.length < 10) {
      return reply.code(400).send({ error: 'password must be at least 10 characters' })
    }
    const email = b.email.toLowerCase().trim()
    const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email])
    if (exists.rows.length) return reply.code(409).send({ error: 'an account with this email already exists' })
    if (!b.password) {
      // No starting password: the teammate gets an invite link instead.
      const invited = await inviteUser({
        workspaceId: user.workspaceId,
        workspaceName: user.workspaceName,
        email,
        name: b.name,
        role: b.role ?? 'member',
        invitedBy: user.name,
      })
      logAuthEvent('user-invited', { email, userId: invited.id, ip: clientIp(req) })
      return { id: invited.id, inviteLink: invited.inviteLink, mailed: mailConfigured() }
    }
    const id = newId('usr')
    await pool.query(
      `INSERT INTO users (id, workspace_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, user.workspaceId, email, b.name, b.role ?? 'member', hashPassword(b.password)]
    )
    logAuthEvent('user-created', { email, userId: id, ip: clientIp(req) })
    return { id }
  })

  // Backup freshness, so a job that stops is seen on the Account page
  // instead of discovered during a restore.
  app.get('/ops/backups', async (req, reply) => {
    const user = (req as FastifyRequest & { user?: SessionUser }).user
    if (!user) return reply.code(401).send({ error: 'no session' })
    if (user.role !== 'admin') return reply.code(403).send({ error: 'admins only' })
    const { rows } = await pool.query(
      `SELECT at, db_bytes, files_bytes, offsite FROM backup_runs ORDER BY at DESC LIMIT 7`
    )
    const last = rows[0]
    const ageHours = last ? (Date.now() - new Date(last.at).getTime()) / 3600000 : null
    return {
      lastAt: last?.at ?? null,
      ageHours,
      // A nightly job that misses one night is late; two nights is stale.
      state: ageHours === null || ageHours > 50 ? 'stale' : ageHours > 26 ? 'late' : 'fresh',
      offsite: last?.offsite ?? false,
      recent: rows.map((r) => ({
        at: r.at,
        dbBytes: Number(r.db_bytes),
        filesBytes: Number(r.files_bytes),
        offsite: r.offsite,
      })),
    }
  })

  app.get('/auth/events', async (req, reply) => {
    const user = (req as FastifyRequest & { user?: SessionUser }).user
    if (!user) return reply.code(401).send({ error: 'no session' })
    if (user.role !== 'admin') return reply.code(403).send({ error: 'admins only' })
    const q = req.query as { limit?: string }
    const limit = Math.min(Math.max(1, Number(q.limit ?? 100) || 100), 500)
    const { rows } = await pool.query(
      `SELECT e.at, e.email, e.kind, e.ip FROM auth_events e
       WHERE e.email IN (SELECT email FROM users WHERE workspace_id = $1)
       ORDER BY e.at DESC LIMIT $2`,
      [user.workspaceId, limit]
    )
    return rows
  })

  app.post('/auth/logout', async (req) => {
    const token = req.headers['x-session']
    if (typeof token === 'string') await pool.query(`DELETE FROM sessions WHERE token = $1`, [token])
    return { ok: true }
  })

  app.post('/auth/change-password', AUTH_RATE, async (req, reply) => {
    const user = (req as FastifyRequest & { user?: SessionUser }).user
    if (!user) return reply.code(401).send({ error: 'no session' })
    const b = req.body as { currentPassword?: string; newPassword?: string }
    if (!b.currentPassword || !b.newPassword) {
      return reply.code(400).send({ error: 'currentPassword and newPassword are required' })
    }
    if (b.newPassword.length < 10) {
      return reply.code(400).send({ error: 'the new password must be at least 10 characters' })
    }
    const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [user.id])
    if (!rows[0] || !checkPassword(b.currentPassword, rows[0].password_hash)) {
      return reply.code(401).send({ error: 'the current password is wrong' })
    }
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hashPassword(b.newPassword), user.id])
    // Every other session dies; the one making the change stays.
    const current = req.headers['x-session']
    await pool.query(`DELETE FROM sessions WHERE user_id = $1 AND token != $2`, [user.id, String(current)])
    logAuthEvent('password-change', { email: user.email, userId: user.id, ip: clientIp(req) })
    return { ok: true }
  })

  app.get('/auth/me', async (req, reply) => {
    const user = (req as FastifyRequest & { user?: SessionUser }).user
    if (!user) return reply.code(401).send({ error: 'no session' })
    const projects = await pool.query(
      `SELECT id, name, district, synthetic FROM projects WHERE workspace_id = $1 ORDER BY created_at`,
      [user.workspaceId]
    )
    return { user, projects: projects.rows }
  })
}

/** Resolve the project named by X-Project and confirm it belongs to the
 * session's workspace. Every project-scoped route goes through this. */
export async function requireProject(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<{ projectId: string } | null> {
  const user = (req as FastifyRequest & { user?: SessionUser }).user
  const projectId = req.headers['x-project']
  if (!user || typeof projectId !== 'string' || !projectId) {
    reply.code(400).send({ error: 'X-Project header is required' })
    return null
  }
  const { rows } = await pool.query(`SELECT 1 FROM projects WHERE id = $1 AND workspace_id = $2`, [
    projectId,
    user.workspaceId,
  ])
  if (!rows.length) {
    reply.code(404).send({ error: 'project not found in this workspace' })
    return null
  }
  return { projectId }
}
