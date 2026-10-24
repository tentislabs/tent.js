import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isStored } from '../../core/internal.ts'

/** The list of what an export wrote, which the next export of the folder reads. */
const listFile = '_t/export.json'

/**
 * Whether an entry of the list is a plain path inside the folder: no two dots, no drive, no slash at its start,
 * and no link on its way, so that removing it can touch nothing outside.
 */
function isPlain(folder: string, entry: string): boolean {
  // Windows takes a backslash between two names as a slash, so either sign parts the entry.
  const parts = entry.split(/[\\/]/)
  if (/^[\\/]/.test(entry) || /^[a-zA-Z]:/.test(entry) || parts.includes('..')) return false
  let at = folder
  for (const part of parts) {
    at = join(at, part)
    try {
      if (lstatSync(at).isSymbolicLink()) return false
    } catch {
      return true
    }
  }
  return true
}

/** The files that the export before wrote into the folder, as its list names them. */
function writtenBefore(folder: string): string[] {
  try {
    const list: unknown = JSON.parse(readFileSync(join(folder, listFile), 'utf8'))
    return isStored(list) && list.format === 'tent.export/1' && Array.isArray(list.files)
      ? list.files.filter((one): one is string => typeof one === 'string')
      : []
  } catch {
    return []
  }
}

/** Takes away the folders that the removal of a file left empty, up to the folder of the export. */
function emptiedUp(folder: string, file: string): void {
  for (let at = dirname(join(folder, file)); at.length > folder.length && existsSync(at); at = dirname(at)) {
    if (readdirSync(at).length) return
    rmdirSync(at)
  }
}

/**
 * Takes the folder of an export and every file it writes, by its path inside the folder. Writes each file,
 * removes each file of the list of the export before that is not written again, and writes the new list. No
 * other file of the folder is touched, and an entry of the old list that is no plain path inside it is left.
 */
export function writtenOut(folder: string, files: Map<string, string | Uint8Array>): void {
  mkdirSync(folder, { recursive: true })
  const before = writtenBefore(folder)
  for (const [path, body] of files) {
    const file = join(folder, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  for (const old of before) {
    if (old === listFile || files.has(old) || !isPlain(folder, old)) continue
    // An entry that names a folder is no file that the export wrote: the folder stays.
    if (lstatSync(join(folder, old), { throwIfNoEntry: false })?.isFile() !== true) continue
    rmSync(join(folder, old), { force: true })
    emptiedUp(folder, old)
  }
  const list = { format: 'tent.export/1', files: [...files.keys(), listFile].sort() }
  writeFileSync(join(folder, listFile), `${JSON.stringify(list, null, 2)}\n`)
}
