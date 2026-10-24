import { randomBytes } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { TentError } from '../../core/index.ts'
import { fingerprintOf } from '../../core/internal.ts'
import type { Change, FileName, Store } from '../../data/index.ts'
import { ageOut, applyChange, backup, bringUp, layoutOf, metaTable, restore } from '../../data/index.ts'
import { archiveOf } from '../archived/archive.ts'
import { backupsOf } from '../backups.ts'
import type { Opened } from '../opened.ts'
import { heldAgain } from '../stored/heldAgain.ts'
import { removeRow, rowsIn, setRow } from './directory.ts'
import type { TenantFiles } from './face.ts'
import { saidBy, sizeOf, sumOf } from './held.ts'
import { applyTenantFiles, planTenantFiles, startPass } from './opening.ts'
import { cacheWrote } from '../pages/cache.ts'
import { heldTemporary } from './temporary.ts'

const system = { kind: 'system' } as const

/** One file of a tenant as the list of a backup names it. */
interface Entry {
  table: string
  id: string
  backup: string
  n: number
}

/** The list of a backup: every file of the directory, with the name of the backup folder that holds its copy. */
function listOf(folder: string): Entry[] {
  const none = (why: string): TentError =>
    new TentError('T0009', `The folder at ${folder} is no backup of the files of tenants: ${why}.`, {
      fix: 'Hand over a folder that `tent data backup` made.',
    })
  if (!existsSync(join(folder, 'files.json'))) throw none('it holds no `files.json`')
  let list: unknown
  try {
    list = JSON.parse(readFileSync(join(folder, 'files.json'), 'utf8'))
  } catch {
    throw none('its `files.json` is no JSON')
  }
  if (!Array.isArray(list)) throw none('its `files.json` is no list')
  return list.map((one) => ({
    table: String(Object(one).table),
    id: String(Object(one).id),
    backup: basename(String(Object(one).backup)),
    n: Number(Object(one).n),
  }))
}

/** Where the copy of one tenant's file stands in a backup, as a path from its folder: a backup mirrors `tenants/`. */
function placeIn(folder: string, id: string): string | undefined {
  const root = join(folder, 'tenants')
  if (!/^[0-9a-z]{26}$/.test(id) || !existsSync(root)) return undefined
  return readdirSync(root)
    .map((table) => join('tenants', table, id.slice(-2), `${id}.db`))
    .find((place) => existsSync(join(folder, place)))
}

/** The backups of the files of tenants that a folder holds, by their names, in the order they were made. */
const backupsIn = (folder: string): string[] =>
  existsSync(folder)
    ? readdirSync(folder)
        .filter((name) => name.startsWith('data-') && existsSync(join(folder, name, 'files.json')))
        .sort()
    : []

/** Opens one data file of a backup to read alone, and counts the rows of every table of the app that it holds. */
function countedIn(make: () => Store, file: string): number {
  const store = make()
  store.open(file, { readOnly: true })
  try {
    let rows = 0
    for (const table of store.layout())
      if (!table.retired && !table.name.startsWith('_t_'))
        rows += Number(store.read({ from: table.name, count: true }, system).value)
    return rows
  } finally {
    store.close()
  }
}

/** Opens the shared file and each tenant's file that the list of a backup names, and counts their rows. Throws where one does not open as data. */
function tested(make: () => Store, folder: string): number {
  let rows = countedIn(make, join(folder, 'data.db'))
  for (const entry of listOf(folder)) {
    const from = join(dirname(folder), entry.backup)
    const place = placeIn(from, entry.id)
    if (place === undefined)
      throw new TentError('T0009', `The backup \`${entry.backup}\` does not hold the data file of ${entry.id}.`)
    rows += countedIn(make, join(from, place))
  }
  return rows
}

/**
 * Takes what the engine holds of an app that keeps a data file for each tenant. Makes a backup in a new folder
 * of `backups/`, file by file: the shared file, and every tenant's file that was written since the backup
 * before, and with `whole` every file. It opens each file that the list names as a test, says the result in the
 * log, and lets the backups age out that are older than the newest ones the project keeps: the files that a kept
 * backup points at go into the oldest kept one first. A backup that cannot be opened is no backup: it is removed,
 * and the older ones stay. Answers the folder, the highest number that a file of it holds, and the rows counted.
 */
export async function backUpFiles(
  o: Opened,
  tenantFiles: TenantFiles,
  how: { whole?: boolean } = {},
): Promise<{ file: string; writes: number; rows?: number }> {
  const says = backupsOf(o.description)
  const folder = join(o.dataFolder, 'backups')
  mkdirSync(folder, { recursive: true })
  const at = o.clock.now()
  const before = backupsIn(folder)
  const last = before.at(-1)
  const { n } = await backup(
    tenantFiles.files,
    folder,
    how.whole ? { whole: true } : last === undefined ? {} : { before: last },
  )
  // The backup answers its number alone: its folder is the one that the folder of the backups did not hold before.
  const name = backupsIn(folder).findLast((one) => !before.includes(one)) ?? ''
  const file = join(folder, name)
  let rows: number | undefined
  if (says.test)
    try {
      rows = tested(tenantFiles.store, file)
      tenantFiles.line('info', 'A backup was taken, and each file of it was opened as a test.', { file: name, rows })
    } catch (error) {
      rmSync(file, { recursive: true, force: true })
      tenantFiles.line('error', 'A backup could not be opened, and is not kept as one.', {
        file: name,
        error: String(error),
      })
      throw error
    }
  for (let kept = backupsIn(folder); kept.length > says.keep; kept = backupsIn(folder))
    ageOut(join(folder, kept[0]), join(folder, kept[1]))
  await archiveOf(o)?.backedUp({ name, n, at }, backupsIn(folder))
  return { file, writes: n, ...(rows === undefined ? {} : { rows }) }
}

/**
 * `app.snapshot` of an app that keeps a data file for each tenant: a folder at the place it is handed, in the
 * form of a backup that was made with `whole`. Answers the highest number that a file of the folder holds.
 */
export async function snapshotFiles(tenantFiles: TenantFiles, toFolder: string): Promise<{ writes: number }> {
  const parent = dirname(toFolder)
  const work = join(parent, `.snapshot-${randomBytes(6).toString('hex')}`)
  mkdirSync(work, { recursive: true })
  try {
    const { n } = await backup(tenantFiles.files, work, { whole: true })
    const [made] = readdirSync(work)
    // The list names its own folder for every file: it goes on under the name of the place it was asked for.
    const list = listOf(join(work, made)).map((entry) => ({ ...entry, backup: basename(toFolder) }))
    writeFileSync(join(work, made, 'files.json'), `${JSON.stringify(list, undefined, 1)}\n`)
    rmSync(toFolder, { recursive: true, force: true })
    renameSync(join(work, made), toFolder)
    return { writes: n }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** Builds the directory anew from what each file that stands on the disk says of itself. */
function directoryAnew(tenantFiles: TenantFiles): void {
  const standing = [...tenantFiles.files.walk()].map((file) => ({ file, said: tenantFiles.peek(file) }))
  tenantFiles.sharedWrite((tx) => {
    for (const row of rowsIn(tenantFiles.files.shared)) removeRow(tx, row.file)
    for (const { file, said } of standing)
      setRow(tx, file, {
        tables: said?.tables ?? [],
        writes: said?.writes ?? 0,
        size: sizeOf(tenantFiles.files.path(file)),
        open: false,
        ...(said?.layout === undefined ? {} : { layout: said.layout }),
        ...(said?.swept === undefined ? {} : { swept: said.swept }),
        ...(said?.lastId === undefined ? {} : { lastId: said.lastId }),
      })
  })
}

/**
 * `app.restore` of an app that keeps a data file for each tenant: puts the folder of a backup back as a whole.
 * Every file is closed, the shared file and each tenant's file are put back, the files that the backup does not
 * name are removed, the directory is built anew from the files, the table changes are applied to the shared file,
 * and the files that are behind are brought up by a pass. The mark of the count of removals is new, so every file
 * is swept when it is next opened. `between` is carried out once the files are put back, before anything is
 * written to them.
 */
export async function restoreFiles(
  o: Opened,
  tenantFiles: TenantFiles,
  folder: string,
  between: () => void,
): Promise<void> {
  listOf(folder)
  tenantFiles.closeFiles()
  await restore(tenantFiles.files, folder)
  between()
  tenantFiles.made()
  directoryAnew(tenantFiles)
  applyTenantFiles(o, tenantFiles, await planTenantFiles(o, tenantFiles, o.description), o.version)
  startPass(o, tenantFiles)
}

/** Writes one value of `_t_meta` of a data file that nothing else holds open. */
function setMeta(store: Store, key: string, value: unknown): void {
  store.write((tx) => {
    const there = tx.read({ from: metaTable.name, one: 'get', id: key }, system) !== undefined
    if (there) tx.change(metaTable.name, key, { value }, system)
    else tx.add(metaTable.name, { key, value }, system)
  })
}

/** Puts the row of a tenant back from the shared file of a backup, in a write of the shared file. */
function rowBack(o: Opened, tenantFiles: TenantFiles, folder: string, file: FileName): void {
  const store = tenantFiles.store()
  store.open(join(folder, 'data.db'), { readOnly: true })
  let row: unknown
  try {
    const held = store.layout().some((one) => one.name === file.table)
    row = held ? store.read({ from: file.table, one: 'get', id: file.id }, system).value : undefined
  } finally {
    store.close()
  }
  if (typeof row !== 'object' || row === null || Array.isArray(row))
    throw new TentError(
      'T2104',
      `\`${file.table}\` holds no row under the id ${file.id}, and neither does the backup: the data file of a tenant is put back for a tenant that is there.`,
    )
  const values: Record<string, unknown> = { ...row }
  o.store.write((tx) => tx.add(file.table, values, system))
}

/**
 * Takes what the engine holds of an app, the folder of a backup, and the id of one tenant. Puts the file of
 * that tenant back alone. Where the row of the tenant is gone, it is put back first, from the shared file of
 * the same backup. The copy is brought up before it is put in place, and, where the changes are kept or archived,
 * takes the number of the change that has every reader fetch the file. Then the file is put in place, its row of
 * the directory is written, the change is kept and handed on, the archive is told the moment of the put-back, and
 * the file is swept. Throws T0009, with nothing put back, for a backup that holds no file of that tenant and for a copy
 * that names another tenant as its own, and the finding of a table change that the copy is refused for.
 */
export async function restoreOne(o: Opened, tenantFiles: TenantFiles, folder: string, id: string): Promise<void> {
  const entry = listOf(folder).find((one) => one.id === id)
  const source = entry ? join(dirname(folder), entry.backup) : folder
  const place = entry ? placeIn(source, id) : undefined
  if (!entry || place === undefined)
    throw new TentError('T0009', `The backup at ${folder} holds no data file of the tenant ${id.slice(0, 60)}.`, {
      fix: '`files.json` of the backup lists the tenants that it holds a file of.',
    })
  const file: FileName = { table: entry.table, id }
  const archive = archiveOf(o)
  const held = heldTemporary(o.dataFolder, 'back')
  const work = held.path
  const copy = join(work, 'one', place)
  mkdirSync(dirname(copy), { recursive: true })
  let change: Change | undefined
  let putAt: number | undefined
  try {
    copyFileSync(join(source, place), copy)
    const store = tenantFiles.store()
    store.open(copy)
    try {
      const said = saidBy(store)
      // A file holds its table and its tenant: under the name of another it is not put in place.
      if (said.tenant !== id || said.table !== file.table)
        throw new TentError(
          'T0009',
          `The file that the backup holds under ${file.table} ${id} is the data file of another tenant: nothing was put back.`,
        )
      if (o.store.read({ from: file.table, one: 'get', id }, system).value === undefined)
        rowBack(o, tenantFiles, folder, file)
      // Brought up on the copy: where a step is refused, the file that stands is left as it is.
      if (tenantFiles.isBehind(file.table, said.layout)) bringUp(store, layoutOf(o.description))
      // Readers fetch the file anew by its change, and the archive holds by it that no record puts it back.
      if (tenantFiles.keeping() || archive) {
        const n = tenantFiles.files.number()
        setMeta(store, 'n', n)
        const sum = sumOf(store) ?? fingerprintOf(new Uint8Array())
        change = {
          n,
          epoch: tenantFiles.epoch(),
          at: o.clock.now(),
          sum,
          record: new Uint8Array(),
          rows: [],
          file,
          fetch: true,
        }
      }
    } finally {
      store.close()
    }
    writeFileSync(join(work, 'one', 'files.json'), JSON.stringify([{ ...entry, backup: 'one' }]))
    // No run writes into the file while it is put back: the runner is closed, as for a restore of the app, and
    // started again on what was put back.
    await o.flows?.runner.close()
    try {
      await restore(tenantFiles.files, join(work, 'one'), { of: file })
    } finally {
      await o.flows?.again()
    }
    putAt = o.clock.now()
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
    held.free()
  }
  const said = tenantFiles.peek(file)
  tenantFiles.sharedWrite((tx) =>
    setRow(tx, file, {
      tables: said?.tables ?? [],
      writes: said?.writes ?? 0,
      size: sizeOf(tenantFiles.files.path(file)),
      open: false,
      failed: null,
      ...(said?.layout === undefined ? {} : { layout: said.layout }),
      ...(said?.swept === undefined ? {} : { swept: said.swept }),
    }),
  )
  // The change makes every reader fetch the file anew, and is handed to the archive, where the moment divides the
  // history of that file: a restore to a moment after it rests on a backup taken since.
  if (change) applyChange(tenantFiles.files, change, { only: 'kept' })
  if (archive && putAt !== undefined) await archive.restored({ at: putAt, of: file })
  await tenantFiles.ready(file)
  // What the rows of the file held then is held again, and what they hold no more is let go of.
  heldAgain(o, file)
  // The live groups that read the file, and the cached screens, are made anew from what was put back.
  const touched = (said?.tables ?? []).map((table) => ({ table, ids: [], file }))
  o.hub?.wrote(touched, false)
  cacheWrote(o, touched, false)
}
