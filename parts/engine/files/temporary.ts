import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// The places under `tenants/.tmp/` that work of this program holds now: the upkeep takes away every other.
const held = new Set<string>()

/** The folder of a data folder under which the work on the files of tenants keeps what is half made. */
export const temporaryFolder = (dataFolder: string): string => join(dataFolder, 'tenants', '.tmp')

/**
 * Takes a data folder, the beginning of a name and its ending. Answers a new place under `tenants/.tmp/` for work of
 * this program, and what lets it go once the work has ended: while it is held, the upkeep leaves it where it lies.
 */
export function heldTemporary(dataFolder: string, name: string, ending = ''): { path: string; free(): void } {
  const folder = temporaryFolder(dataFolder)
  mkdirSync(folder, { recursive: true })
  const path = resolve(folder, `${name}-${randomBytes(6).toString('hex')}${ending}`)
  held.add(path)
  return { path, free: () => void held.delete(path) }
}

/** Whether a place under `tenants/.tmp/` is held by work of this program that is under way. */
export const isHeldTemporary = (path: string): boolean => held.has(resolve(path))
