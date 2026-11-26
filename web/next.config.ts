import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The repo root is the workspace root (server/ and web/ share one lockfile).
  turbopack: { root: path.join(process.cwd(), '..') },
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  // A self-contained server for the Docker image; Vercel ignores it.
  output: 'standalone',
}

export default nextConfig
