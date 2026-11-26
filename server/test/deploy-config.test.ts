/**
 * C1: every environment variable the API reads reaches the API container.
 * Compose passes only what the service lists, so a variable the code reads
 * but compose omits is silently unset in production (this is how APP_URL,
 * the reset webhook and the Isometric credentials once went missing).
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.join(__dirname, '..')
// Read by the one-shot seed run, which the operator starts with explicit -e
// flags. SEED_FORCE in particular must never sit in the container's env.
const ONE_SHOT = new Set(['SEED_DEMO_PASSWORD', 'SEED_CMHQ_PASSWORD', 'SEED_FORCE'])

function readByServer(): Set<string> {
  const dir = path.join(root, 'src')
  const keys = new Set<string>()
  for (const file of readdirSync(dir, { recursive: true }) as string[]) {
    if (!file.endsWith('.ts')) continue
    for (const m of readFileSync(path.join(dir, file), 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      keys.add(m[1])
    }
  }
  return keys
}

function passedToApi(): Set<string> {
  const compose = readFileSync(path.join(root, '..', 'docker-compose.yml'), 'utf8').split('\n')
  const start = compose.findIndex((l) => /^ {2}api:\s*$/.test(l))
  const keys = new Set<string>()
  let inEnv = false
  for (const line of compose.slice(start + 1)) {
    if (/^ {2}\S/.test(line)) break // next service
    if (/^ {4}environment:\s*$/.test(line)) {
      inEnv = true
      continue
    }
    if (inEnv && /^ {4}\S/.test(line)) inEnv = false
    const m = inEnv && line.match(/^ {6}([A-Z0-9_]+):/)
    if (m) keys.add(m[1])
  }
  return keys
}

describe('C1 deployment config', () => {
  it('compose hands the API container every variable the server reads', () => {
    const passed = passedToApi()
    expect(passed.size).toBeGreaterThan(3)
    const missing = [...readByServer()].filter((k) => !passed.has(k) && !ONE_SHOT.has(k))
    expect(missing).toEqual([])
  })
})
