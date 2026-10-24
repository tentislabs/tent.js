import { existsSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fingerprintOf } from '../core/internal.ts'

/**
 * Takes the folder of a project, a file that was told of, and the fingerprint of the bytes of each file that the
 * newest build read, by its path. Answers whether the file holds a save that build did not read: one gone, one it
 * read with other bytes, or one it did not read, whatever moment it carries. A notice that comes after the round that
 * built its save is so no save.
 */
export function unread(folder: string, file: string, prints: Record<string, string>): boolean {
  if (!existsSync(file)) return true
  const held = prints[relative(folder, file).replaceAll('\\', '/')]
  return held === undefined || fingerprintOf(readFileSync(file)) !== held
}
