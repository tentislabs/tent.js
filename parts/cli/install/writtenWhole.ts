import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { writeOwnerOnly } from '../../core/internal.ts'

/**
 * Takes the path of a file and its text or its bytes. Writes them into a new file beside it, for the current user
 * alone, and renames that into its place: so the file is whole or as it was, and a link that another user put
 * there is replaced and never written through. Its folder is made where there is none, for the current user alone.
 */
export function writtenWhole(path: string, text: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const beside = join(dirname(path), `.${basename(path)}.${process.pid}`)
  writeOwnerOnly(beside, text)
  try {
    renameSync(beside, path)
  } finally {
    rmSync(beside, { force: true })
  }
}
