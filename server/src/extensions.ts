/**
 * Extensions: code that runs inside the API without living in this repo.
 *
 * OPENCHAR_EXTENSIONS is a comma-separated list of module paths or package
 * names. Each module exports `register(app, api)`, called once at boot,
 * after the core routes and before the server listens. An extension can add
 * routes, register a mailer, or read the database through the same pool.
 *
 * The hosted service at openchar.carbonmarketshq.com uses this for its
 * email-verified sign-up and Amazon SES mail. A self-hosted server needs
 * none of it.
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import * as auth from './auth.js'
import * as db from './db.js'
import * as mail from './mail.js'

const sessionlessPrefixes: string[] = []

export function isSessionlessExtensionRoute(route: string): boolean {
  return sessionlessPrefixes.some((p) => route === p || route.startsWith(`${p}/`))
}

export type ExtensionApi = {
  pool: typeof db.pool
  newId: typeof db.newId
  auth: Pick<
    typeof auth,
    | 'createSession'
    | 'createWorkspaceWithAdmin'
    | 'resolveSession'
    | 'logAuthEvent'
    | 'clientIp'
    | 'appUrl'
    | 'signupMode'
  >
  setMailer: typeof mail.setMailer
  sendMail: typeof mail.sendMail
  /** Routes under this prefix need the service token but no user session. */
  allowWithoutSession(prefix: string): void
}

export async function loadExtensions(app: FastifyInstance): Promise<string[]> {
  const specs = (process.env.OPENCHAR_EXTENSIONS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const api: ExtensionApi = {
    pool: db.pool,
    newId: db.newId,
    auth: {
      createSession: auth.createSession,
      createWorkspaceWithAdmin: auth.createWorkspaceWithAdmin,
      resolveSession: auth.resolveSession,
      logAuthEvent: auth.logAuthEvent,
      clientIp: auth.clientIp,
      appUrl: auth.appUrl,
      signupMode: auth.signupMode,
    },
    setMailer: mail.setMailer,
    sendMail: mail.sendMail,
    allowWithoutSession: (prefix) => sessionlessPrefixes.push(prefix.replace(/\/$/, '')),
  }
  for (const spec of specs) {
    const target = spec.startsWith('.') || spec.startsWith('/') ? pathToFileURL(path.resolve(spec)).href : spec
    const mod = (await import(target)) as { register?: (app: FastifyInstance, api: ExtensionApi) => unknown }
    if (typeof mod.register !== 'function') throw new Error(`extension ${spec} exports no register()`)
    await mod.register(app, api)
    console.log(`extension loaded: ${spec}`)
  }
  return specs
}
