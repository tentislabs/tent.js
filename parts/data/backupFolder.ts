import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { TentError } from '../core/index.ts'
import { isId } from './ids.ts'

/**
 * One file of a tenant as the list of a backup names it: the table and the id of its tenant, the name of the
 * backup folder that holds its copy, and the number of the last write that the copy holds, by which the next
 * backup knows a file that was not written since.
 */
export interface BackedUp {
  table: string
  id: string
  backup: string
  n: number
}

/** The name of the list that every backup of the files of tenants holds. A folder that holds none is no whole backup. */
const listFile = 'files.json'

const isEntry = (one: unknown): one is BackedUp =>
  typeof one === 'object' &&
  one !== null &&
  'table' in one &&
  typeof one.table === 'string' &&
  'id' in one &&
  isId(one.id) &&
  'backup' in one &&
  typeof one.backup === 'string' &&
  // The name of a folder beside this one, and never a path that leaves the folder of the backups.
  one.backup === basename(one.backup) &&
  !one.backup.startsWith('.') &&
  'n' in one &&
  typeof one.n === 'number'

/** Whether a folder is a whole backup of the files of tenants: it holds its list. */
export const isBackup = (folder: string): boolean => existsSync(join(folder, listFile))

/** Answers the list of a backup. Throws T0009 for a folder that holds none, and for a list that is none. */
export function listOf(folder: string): BackedUp[] {
  const none = (why: string) =>
    new TentError('T0009', `The folder at ${folder} is no backup of the files of tenants: ${why}.`, {
      fix: 'Hand over a folder that `backup` made.',
    })
  if (!isBackup(folder)) throw none(`it holds no \`${listFile}\``)
  let list: unknown
  try {
    list = JSON.parse(readFileSync(join(folder, listFile), 'utf8'))
  } catch {
    throw none(`its \`${listFile}\` is no JSON`)
  }
  if (!Array.isArray(list) || !list.every(isEntry)) throw none(`its \`${listFile}\` is no list of files`)
  return list
}

/** Writes the list of a backup: whole beside the old one before it takes its place. */
export function writeList(folder: string, list: BackedUp[]): void {
  const coming = join(folder, `${listFile}.coming`)
  writeFileSync(coming, `${JSON.stringify(list, undefined, 1)}\n`)
  renameSync(coming, join(folder, listFile))
}

/**
 * Takes the folder of a backup and the id of a tenant. Answers where the copy of that tenant's file stands
 * in it, as a path from the folder, or nothing where the folder holds none. A backup mirrors `tenants/`, and the id
 * of a row is its own in the whole app, so the id alone finds the file.
 */
export function copyIn(folder: string, id: string): string | undefined {
  const root = join(folder, 'tenants')
  if (!existsSync(root)) return undefined
  return readdirSync(root)
    .map((table) => join('tenants', table, id.slice(-2), `${id}.db`))
    .find((place) => existsSync(join(folder, place)))
}

/**
 * Takes the folder that holds the backups, and the ending of a name. Answers a name that nothing in the folder
 * has: `data-`, the moment, and the ending. The names of a folder so stand in the order the backups were made.
 */
export function newBackup(toFolder: string, ending: string): string {
  const moment = new Date().toISOString().replaceAll(':', '-').replace('.', '-')
  let name = `data-${moment}${ending}`
  for (let again = 1; existsSync(join(toFolder, name)); again++) name = `data-${moment}-${again}${ending}`
  return name
}
