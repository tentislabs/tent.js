import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** The list of a version that a build of a session wrote: the fingerprint of each of its files, by its path. */
export function listOf(list: string): Record<string, string> {
  const read: unknown = JSON.parse(readFileSync(list, 'utf8'))
  const files: unknown = Reflect.get(Object(read), 'files')
  if (typeof files !== 'object' || files === null) throw new Error(`${list} holds no files`)
  return Object.fromEntries(Object.entries(files).map(([path, print]) => [path, String(print)]))
}

/** The files of a version that a build of a session wrote as a list, each by its path, with its bytes. */
function listedFiles(list: string): Map<string, Buffer> {
  const store = join(dirname(list), 'files')
  return new Map(Object.entries(listOf(list)).map(([path, print]) => [path, readFileSync(join(store, print))]))
}

/**
 * Lays the files of a version that a build of a session wrote as a list out as a folder, beside the data of the
 * project, and answers the folder: what a test reads of a bundle by its folder it reads there.
 */
export function listedFolder(list: string): string {
  const folder = join(dirname(list), '..', 'laid-out', basename(list, '.json'))
  for (const [path, bytes] of listedFiles(list)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), bytes)
  }
  return folder
}
