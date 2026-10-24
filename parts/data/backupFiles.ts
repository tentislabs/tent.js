import { mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { TentError } from '../core/index.ts'
import type { BackedUp } from './backupFolder.ts'
import { listOf, newBackup, writeList } from './backupFolder.ts'
import type { Files } from './files.ts'
import { insideOf } from './filesInside.ts'
import { heldMeta } from './metaKeys.ts'
import { placeOf } from './place.ts'

/**
 * Takes the files of an app, the folder of its backups, and in `before` the name of the backup before, a folder
 * of that folder. Makes a backup in a new folder of that folder, file by file: the tenants' files first and the
 * shared file last, so that no file of a backup is newer than its shared file. Each is the store's own `snapshot`
 * of that file, at the place it has under the data folder. A tenant's file that stands at the number its copy
 * of the backup before holds is not copied: the list names the backup that holds it. With `whole`, and for a file
 * that holds no number of its last write, every file is copied. The list, `files.json`, is written last, so a
 * folder that holds none is no whole backup. Answers a promise of the highest number that a file of the backup
 * holds. Throws T0009 where `before` names no backup, and T0013 for files whose shared store keeps no file.
 */
export async function backupFiles(
  files: Files,
  toFolder: string,
  o: { before?: string; whole?: true },
): Promise<{ n: number }> {
  const inside = insideOf(files)
  const place = placeOf(inside.shared)
  if (!place)
    throw new TentError('T0013', 'A backup is made of files that stand on the disk, and this store keeps none.', {
      fix: 'Back the data of a store of your own up with the tools of that store.',
    })
  const earlier = new Map<string, BackedUp>()
  if (o.before !== undefined && !o.whole)
    for (const entry of listOf(join(toFolder, o.before))) earlier.set(entry.id, entry)
  mkdirSync(toFolder, { recursive: true })
  const name = newBackup(toFolder, '')
  const folder = join(toFolder, name)
  const list: BackedUp[] = []
  for (const file of files.walk()) {
    const copied = earlier.get(file.id)
    // An open file is asked for its last write, and a closed one is opened to read alone.
    if (copied && inside.alone(file, (store) => heldMeta(store, 'n')) === copied.n) {
      list.push({ ...file, backup: copied.backup, n: copied.n })
      continue
    }
    const to = join(folder, relative(dirname(place.file), files.path(file)))
    mkdirSync(dirname(to), { recursive: true })
    const { n } = await inside.snapshot(file, to)
    list.push({ ...file, backup: name, n })
  }
  mkdirSync(folder, { recursive: true })
  const shared = await inside.shared.snapshot(join(folder, 'data.db'))
  writeList(folder, list)
  return { n: Math.max(shared.n, ...list.map((one) => one.n)) }
}
