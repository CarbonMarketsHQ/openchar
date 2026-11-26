import path from 'node:path'
import type { NextConfig } from 'next'

// The repo root is the workspace root (server/ and web/ share one lockfile).
const root = path.join(process.cwd(), '..')

const nextConfig: NextConfig = {
  turbopack: { root },
  // A self-contained server for the Docker image. Vercel builds the web
  // folder on its own and packages the output itself, so it skips this.
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const, outputFileTracingRoot: root }),
}

export default nextConfig
