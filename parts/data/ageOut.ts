import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { TentError } from '../core/index.ts'
import { copyIn, isBackup, listOf, writeList } from './backupFolder.ts'

/**
 * Takes the folder of a backup of the files of tenants that ages out, and the folder of the oldest backup that
 * is kept, beside it. Every file of a tenant that the list of a kept backup names in the folder that ages out
 * goes into the kept one, at the same place; then the lists of the kept backups, the folders beside it that hold a
 * list, name the kept one for those files; and the folder that ages out is removed last. So every kept backup
 * puts back every file, and a stop at any moment leaves every list with the files it names. Throws T0009, with
 * nothing changed, where one of the two is no backup, where they do not stand in one folder, and where the kept
 * one already holds a file of its own that would be written over, as a backup that is older than the one that
 * ages out does.
 */
export function ageOut(folder: string, into: string): void {
  const [old, kept] = [basename(folder), basename(into)]
  const beside = dirname(resolve(folder))
  if (dirname(resolve(into)) !== beside || old === kept)
    throw new TentError('T0009', `The backups at ${folder} and at ${into} are not two backups of one folder.`)
  listOf(folder)
  listOf(into)
  const lists = readdirSync(beside)
    .filter((name) => name !== old && isBackup(join(beside, name)))
    .map((name) => ({ name, list: listOf(join(beside, name)) }))
  const pointed = new Set(
    lists.flatMap(({ list }) => list.filter((entry) => entry.backup === old)).map((one) => one.id),
  )
  const moves = [...pointed].map((id) => {
    const place = copyIn(folder, id)
    if (place === undefined)
      throw new TentError(
        'T0009',
        `The backup at ${folder} does not hold the data file of ${id}, which a kept backup keeps in it.`,
      )
    if (existsSync(join(into, place)))
      throw new TentError(
        'T0009',
        `The backup at ${into} holds a data file of ${id} of its own: a backup ages out into the oldest backup that is kept after it.`,
        { fix: 'Age the oldest backup out first.' },
      )
    return place
  })
  for (const place of moves) {
    mkdirSync(dirname(join(into, place)), { recursive: true })
    copyFileSync(join(folder, place), join(into, place))
  }
  for (const { name, list } of lists)
    if (list.some((entry) => entry.backup === old))
      writeList(
        join(beside, name),
        list.map((entry) => (entry.backup === old ? { ...entry, backup: kept } : entry)),
      )
  rmSync(folder, { recursive: true, force: true })
}
