/**
 * Uploaded files are stored on disk under their SHA-256 hash, so the same
 * file is kept once and any change to a stored file would show against the
 * hash recorded in the database.
 */
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import type { FastifyRequest } from 'fastify'

export const FILES_DIR = process.env.FILES_DIR || './data/files'

export type SavedFile = { path: string; sha256: string; mime: string; size: number; filename: string | null }

/** Stream a multipart request to disk. Returns the text fields and the one
 * file part, or file: null when the request carried no file. */
export async function saveUpload(req: FastifyRequest): Promise<{ fields: Record<string, string>; file: SavedFile | null }> {
  await mkdir(FILES_DIR, { recursive: true })
  const fields: Record<string, string> = {}
  let file: SavedFile | null = null
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const tmp = path.join(FILES_DIR, `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      const hash = createHash('sha256')
      let size = 0
      const sink = createWriteStream(tmp)
      for await (const chunk of part.file) {
        hash.update(chunk as Buffer)
        size += (chunk as Buffer).length
        sink.write(chunk)
      }
      await new Promise((res) => sink.end(res))
      const sha256 = hash.digest('hex')
      const ext = path.extname(part.filename ?? '').slice(0, 10) || '.bin'
      const finalPath = path.join(FILES_DIR, `${sha256}${ext}`)
      await rename(tmp, finalPath)
      file = { path: finalPath, sha256, mime: part.mimetype, size, filename: part.filename ?? null }
    } else {
      fields[part.fieldname] = String(part.value)
    }
  }
  return { fields, file }
}
