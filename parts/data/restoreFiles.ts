import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { BackedUp } from './backupFolder.ts'
import { copyIn, listOf } from './backupFolder.ts'
import { tenantIn } from './tenantIn.ts'
import type { FileName } from './fileName.ts'
import type { Files } from './files.ts'
import { insideOf } from './filesInside.ts'
import { placeOf } from './place.ts'
import { restoreStore } from './restoreStore.ts'
import { swapIn } from './swapIn.ts'

const system = { kind: 'system' } as const

/**
 * Finds the copy of one tenant's file that the list of a backup names. Throws T0009 where the backup that
 * holds it is not there, naming it, and where the copy names another tenant as its own.
 */
function copyOf(folder: string, entry: BackedUp): { place: string; file: string } {
  const backup = join(dirname(folder), entry.backup)
  const place = existsSync(backup) ? copyIn(backup, entry.id) : undefined
  if (place === undefined)
    throw new TentError(
      'T0009',
      `The backup at ${folder} keeps the data file of ${entry.table} ${entry.id} in the backup \`${entry.backup}\`, which is not there or does not hold it: nothing was put back.`,
      {
        fix: `Put the folder \`${entry.backup}\` back beside this backup, or restore a backup that was made with \`whole\`.`,
      },
    )
  const file = join(backup, place)
  // A file holds its table and its tenant: one that was put under another tenant is not put in place.
  if (tenantIn(file) !== entry.id)
    throw new TentError(
      'T0009',
      `The file that the backup \`${entry.backup}\` holds under ${entry.table} ${entry.id} is the data file of another tenant: nothing was put back.`,
    )
  return { place, file }
}

/**
 * Takes the files of an app, the folder of a backup of them, and in `of` one tenant. Puts back the shared file
 * and every tenant's file, each from the backup that the list names for it, and removes the files that the
 * backup does not name. The shared file is put back as a store is, so the mark of the count of removals is new,
 * and every file is swept when it is next opened. With `of` it puts back the file of that one tenant alone,
 * whose row stands in the shared file. Whoever calls it has stopped the writes, and closed every connection to
 * the files that the files of the app did not open. Every copy is found and held against its tenant before
 * anything is put in place. Answers a promise. Throws T0009 for a folder that is no backup, for a list that
 * names a backup which is not there, naming it, for a copy that names another tenant as its own, and for one
 * tenant that the backup holds no file of; T2104 for one tenant whose row is not there; and T0013 for files
 * whose shared store keeps no file.
 */
export async function restoreFiles(files: Files, folder: string, o: { of?: FileName }): Promise<void> {
  const inside = insideOf(files)
  const shared = placeOf(inside.shared)
  if (!shared)
    throw new TentError('T0013', 'A backup is put back into files that stand on the disk, and this store keeps none.', {
      fix: 'Put the data of a store of your own back with the tools of that store.',
    })
  const list = listOf(folder)
  if (o.of) {
    const one = o.of
    const place = files.path(one)
    const entry = list.find((named) => named.id === one.id)
    if (!entry) throw new TentError('T0009', `The backup at ${folder} holds no data file of ${one.table} ${one.id}.`)
    const copy = copyOf(folder, entry)
    if (inside.shared.read({ from: one.table, one: 'get', id: one.id }, system).value === undefined)
      throw new TentError(
        'T2104',
        `\`${one.table}\` holds no row under the id ${one.id}: the data file of a tenant is put back for a tenant that is there.`,
        { fix: 'Put the row of the tenant back first.' },
      )
    files.close(one)
    swapIn(copy.file, place)
    return
  }
  const copies = list.map((entry) => copyOf(folder, entry))
  for (const file of files.open()) files.close(file)
  await restoreStore(files.shared, join(folder, 'data.db'))
  // A stated rename of the table of the tenants moves no file, so a file goes back where its backup holds it.
  for (const copy of copies) swapIn(copy.file, join(dirname(shared.file), copy.place))
  const named = new Set(list.map((entry) => entry.id))
  for (const file of [...files.walk()]) if (!named.has(file.id)) files.remove(file)
}
