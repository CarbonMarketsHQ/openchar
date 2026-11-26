import { defineConfig } from '@playwright/test'

/**
 * Full-stack evals: Postgres (docker compose) + API (server/) + web (web/).
 * global-setup brings the db up and seeds it; the two webServer entries
 * start API and web. `npm run evals` is the one command.
 */
const API_ENV = {
  DATABASE_URL: 'postgres://biochar:biochar@localhost:5466/biochar',
  API_TOKEN: 'dev-token',
  API_TOKEN_PREVIOUS: 'dev-token-previous', // exercises the rotation window (A2c)
  PORT: '8788',
  AUTH_RATE_MAX: '1000',
  MQTT_REFRESH_MS: '2000',
  // The evals create fresh workspaces through sign-up; a real server keeps
  // it closed (the default) and invites people instead.
  SIGNUP_MODE: 'open',
  APP_URL: 'http://localhost:3187',
}

const WEB_ENV = {
  API_URL: 'http://localhost:8788',
  API_TOKEN: 'dev-token',
}

export default defineConfig({
  testDir: './evals/e2e',
  globalSetup: './evals/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3187',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -w server',
      url: 'http://localhost:8788/health',
      reuseExistingServer: true,
      timeout: 60_000,
      env: API_ENV,
    },
    {
      command: 'npm run build -w web && npm run start -w web -- -p 3187',
      url: 'http://localhost:3187/login',
      // Never reuse whatever else happens to hold the port locally.
      reuseExistingServer: false,
      timeout: 240_000,
      env: WEB_ENV,
    },
  ],
})
