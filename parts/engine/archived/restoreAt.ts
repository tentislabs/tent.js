import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Files, SinkChange, Store } from '../../data/index.ts'
import { applyChanges, openFiles, sqliteStore } from '../../data/index.ts'
import { takeBackup } from '../backups.ts'
import type { Opened } from '../opened.ts'
import { engineTables, layoutFor } from '../tableChanges.ts'
import type { PutBack, Rested } from './archive.ts'
import { archiveOf } from './archive.ts'

const system = { kind: 'system' } as const

/** What a restore to a moment says: the backup it starts from, how many changes it applies, and the moment it reaches. */
export interface RestoredAt {
  backup: string
  changes: number
  reaches: string
}

/** The number of the last write that a data file holds. */
function numberOf(store: Store): number {
  const held: unknown = store.read({ from: '_t_meta', one: 'get', id: 'n' }, system).value
  return Number(Reflect.get(Object(held), 'value') ?? 0)
}

/** The list of a backup of the files of tenants: each file with the backup folder that holds its copy. */
function listIn(folder: string): { table: string; id: string; backup: string }[] {
  const read: unknown = JSON.parse(readFileSync(join(folder, 'files.json'), 'utf8'))
  return (Array.isArray(read) ? read : []).map((one) => ({
    table: String(Object(one).table),
    id: String(Object(one).id),
    backup: String(Object(one).backup),
  }))
}

/** Where the copy of one tenant's file stands in a backup folder, as a path from it: a backup mirrors `tenants/`. */
function placeIn(folder: string, id: string): string | undefined {
  const root = join(folder, 'tenants')
  if (!existsSync(root)) return undefined
  return readdirSync(root)
    .map((table) => join('tenants', table, id.slice(-2), `${id}.db`))
    .find((place) => existsSync(join(folder, place)))
}

/** Lays a backup of the files of tenants out as a data folder: the shared file, and each tenant's file at its place. */
function laidOut(backup: string, into: string): void {
  mkdirSync(into, { recursive: true })
  copyFileSync(join(backup, 'data.db'), join(into, 'data.db'))
  for (const entry of listIn(backup)) {
    const from = join(dirname(backup), entry.backup)
    const place = placeIn(from, entry.id)
    if (place === undefined)
      throw new TentError('T0009', `The backup \`${entry.backup}\` does not hold the data file of ${entry.id}.`)
    mkdirSync(dirname(join(into, place)), { recursive: true })
    copyFileSync(join(from, place), join(into, place))
  }
}

/** A change that the archive cannot put into a file: one whose file was fetched whole, which no record holds. */
function heldTo(change: SinkChange): void {
  if (change.fetch && change.file)
    throw new TentError(
      'T0009',
      `The archive cannot reach that moment: the data file of ${change.file.table} ${change.file.id} was put back whole at the write ${change.n}, and no record holds it.`,
      { fix: 'Restore to a moment after the backup that was taken once that file was put back.' },
    )
}

/** Applies the changes to the files of tenants that a folder holds, each to its file, and writes the list of a backup of them. */
async function filesApplied(o: Opened, folder: string, changes: SinkChange[]): Promise<void> {
  const files: Files = openFiles(folder, layoutFor(o.description, await engineTables()), { store: () => sqliteStore() })
  try {
    for (const change of changes) heldTo(change)
    // The shared file holds every write of its own up to its number, and a tenant's file says so of itself.
    const shared = numberOf(files.shared)
    applyChanges(
      files,
      changes.filter((change) => change.file || change.n > shared),
    )
    const list = [...files.walk()].map((file) => {
      const store = sqliteStore()
      store.open(files.path(file), { readOnly: true })
      try {
        return { ...file, backup: 'restored', n: numberOf(store) }
      } finally {
        store.close()
      }
    })
    writeFileSync(join(folder, 'files.json'), `${JSON.stringify(list, undefined, 1)}\n`)
  } finally {
    for (const file of files.open()) files.close(file)
    files.shared.close()
  }
}

/**
 * The backup that the data of a moment rests on, and the moment from which the changes after it are of the same
 * history: the newest backup before the moment, where the data was not put back between; and where it was, a
 * backup taken since, or the backup that was put back with the changes since it was. Throws T0002 where no backup
 * was taken before the moment, and T0009 where the data was put back from a file that is no kept backup and none
 * was taken since.
 */
function baseOf(held: { backups: Rested[]; restores: PutBack[] }, at: number): { base: Rested; from: number } {
  const put = held.restores.filter((one) => one.at <= at).at(-1)
  const before = held.backups.filter((one) => one.at <= at && (!put || one.at >= put.at)).at(-1)
  if (before) return { base: before, from: before.at }
  const back = put?.from === undefined ? undefined : held.backups.find((one) => one.name === put.from)
  if (put && back) return { base: back, from: put.at }
  if (put)
    throw new TentError(
      'T0009',
      put.of
        ? `The archive cannot reach that moment: the data file of ${put.of.table} ${put.of.id} was put back alone at ${new Date(put.at).toISOString()}, and no backup was taken between that and the moment.`
        : `The archive cannot reach that moment: the data was put back at ${new Date(put.at).toISOString()} from a file that is no backup it keeps, and no backup was taken between that and the moment.`,
      { fix: 'Restore to a moment after the next backup.' },
    )
  throw new TentError('T0002', `No backup that the archive rests on was taken before ${new Date(at).toISOString()}.`, {
    fields: { at: 'before the oldest backup' },
  })
}

/**
 * Takes what the engine holds of an app, a moment, and whether the restore is to be carried out or only said.
 * Brings every data file of the app to that moment: the newest backup before it, and the archived changes up to
 * it applied one by one, a tenant's file by its own backup and its own changes. The data that stood is kept as a
 * backup of its own first, and what was put back is a backup too, which a moment after it rests on. Answers the
 * backup, the number of changes, and the moment the data reaches. Throws T2028 for an app whose archive is off,
 * T0002 for a moment before the oldest backup that the archive rests on, and T0009 where the archive cannot reach
 * the moment.
 */
export async function restoreAt(o: Opened, at: number, how: { dry?: boolean } = {}): Promise<RestoredAt> {
  const archive = archiveOf(o)
  if (!archive)
    throw new TentError('T2028', 'This app keeps no archive of its changes: nothing can be restored to a moment.', {
      fix: 'Take `archive: false` out of `backups` in the project; a restore reaches back to the first backup after that.',
    })
  const { base, from } = baseOf(await archive.backups(), at)
  const changes = await archive.changesAfter(base, from, at)
  const said: RestoredAt = {
    backup: base.name,
    changes: changes.length,
    reaches: new Date(changes.at(-1)?.at ?? base.at).toISOString(),
  }
  if (how.dry) return said
  const work = join(o.dataFolder, 'backups', `.restore-${randomBytes(6).toString('hex')}`)
  mkdirSync(work, { recursive: true })
  try {
    const from = await archive.fetched(base, join(work, 'fetched'))
    const place = join(work, 'restored')
    if (o.tenantFiles) {
      laidOut(from, place)
      await filesApplied(o, place, changes)
    } else {
      mkdirSync(place, { recursive: true })
      copyFileSync(from, join(place, 'data.db'))
      const store = sqliteStore()
      store.open(place)
      try {
        applyChanges(store, changes)
      } finally {
        store.close()
      }
    }
    // The data that stood is kept, and what was put back is the backup that a later moment rests on.
    await takeBackup(o)
    await o.app.restore(o.tenantFiles ? place : join(place, 'data.db'))
    await takeBackup(o)
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
  return said
}
