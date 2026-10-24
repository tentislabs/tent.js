import { existsSync, readdirSync, rmdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Opened } from '../opened.ts'
import type { TenantFiles } from './face.ts'
import { removeRow, rowsIn, saidFields, setRow } from './directory.ts'
import { isHeldTemporary, temporaryFolder } from './temporary.ts'
import type { FileName } from '../../data/index.ts'
import { hasBeside, fileKeyOf, liesElsewhere, mayBeDataFile, setAside, sizeOf } from './held.ts'

const system = { kind: 'system' } as const

/** What the upkeep of the files of tenants found and did, each file by the id of its tenant. */
export interface Stray {
  // Files whose tenant is gone, which were removed.
  removed: string[]
  // Files that had no row of the directory, which were given one.
  listed: string[]
  // Files that a stop left with something beside them, which was folded into them.
  folded: string[]
  // Files that name another tenant than the one they stand under, which were moved aside.
  refused: string[]
  // How many half-fetched and temporary copies were removed.
  temporary: number
}

/** Whether what lies at one place under `tenants/`, which nothing holds open, is no data file. `opened` asks the thing itself: it is opened to read alone, and one that does not open, or that does not say what it is, is none. */
function isNone(o: Opened, tenantFiles: TenantFiles, file: FileName, opened: boolean): boolean {
  if (!mayBeDataFile(tenantFiles.files.path(file), join(o.dataFolder, 'data.db'))) return true
  if (!opened) return false
  try {
    tenantFiles.peek(file)
    return false
  } catch {
    return true
  }
}

/**
 * Takes what the engine holds of an app, its files, and one place under `tenants/`. Bears what a hand laid there
 * and is no data file: a folder, bytes of another kind, a file that does not open, and one that does not say what
 * it is. It is removed where its tenant is gone, and moved aside where its tenant is there, as a file that names
 * another tenant is. Its row of the directory goes, and the log says so. `opened` has the thing itself asked,
 * where a look at its first bytes is not enough. Answers what it did, or nothing for a data file, which it leaves alone.
 */
export function borne(
  o: Opened,
  tenantFiles: TenantFiles,
  file: FileName,
  opened = false,
): 'removed' | 'refused' | undefined {
  const path = tenantFiles.files.path(file)
  if (tenantFiles.isOpen(file) || tenantFiles.isBusy(file) || !isNone(o, tenantFiles, file, opened)) return undefined
  const what = statSync(path, { throwIfNoEntry: false })?.isDirectory() ? 'a folder' : 'bytes of another kind'
  const there = tenantFiles.files.shared.read({ from: file.table, one: 'get', id: file.id }, system).value !== undefined
  if (there) setAside(path)
  else rmSync(path, { recursive: true, force: true })
  tenantFiles.sharedWrite((tx) => removeRow(tx, file))
  const done = there ? 'moved aside' : 'removed'
  tenantFiles.line('error', `What lay in the place of the data file of a tenant is no data file, and was ${done}.`, {
    ...file,
    what,
  })
  return there ? 'refused' : 'removed'
}

/**
 * Whether a data file that nothing holds open holds a row of a table of the app, read alone. A retired table
 * counts as any other: its rows are read again by a version that holds the table again, until a clean drops it.
 */
function holdsRows(tenantFiles: TenantFiles, path: string): boolean {
  const store = tenantFiles.store()
  store.open(path, { readOnly: true, lazy: true })
  try {
    return store
      .layout()
      .filter((one) => !one.name.startsWith('_t_'))
      .some((one) => {
        // No plan reads a retired table, so its rows are asked for by raw SQL: a store that takes none keeps the file.
        const rows = !one.retired
          ? store.read({ from: one.name, limit: 1 }, system).value
          : store.sql
            ? store.sql(`SELECT 1 FROM "${one.name.replaceAll('"', '""')}" LIMIT 1`, [])
            : [one]
        return Array.isArray(rows) && rows.length > 0
      })
  } finally {
    store.close()
  }
}

/**
 * Moves aside what lies in the place of a file that SQLite keeps beside a data file and is no file: with it there
 * the data file itself does not open. Answers whether it moved something, and says so in the log.
 */
function besideAside(tenantFiles: TenantFiles, file: FileName): boolean {
  let moved = false
  for (const ending of ['-wal', '-shm']) {
    const beside = `${tenantFiles.files.path(file)}${ending}`
    const lies = statSync(beside, { throwIfNoEntry: false })
    if (!lies || lies.isFile()) continue
    setAside(beside)
    moved = true
    tenantFiles.line(
      'error',
      'What lay beside the data file of a tenant, in the place of a file of its store, is no file, and was moved aside.',
      {
        ...file,
        beside: ending,
      },
    )
  }
  return moved
}

/**
 * Takes what the engine holds of an app, and its files. Holds the disk against the directory, both ways: a file
 * whose tenant is gone is removed; a file with no row is given one, from what it says of itself; a file that
 * names another tenant as its own is moved aside, and read for nobody; a row with no file is taken away; what a
 * stop left beside a closed file is folded into it; everything under `tenants/.tmp/` is removed; and an empty folder
 * is removed. A reader folds, removes what is temporary, and does nothing else. Whatever it cannot read, open or
 * remove at one place is borne for that place, said in the log and named in what it answers, and never ends the
 * walk. Answers what it found and did.
 */
export function upkeepFiles(o: Opened, tenantFiles: TenantFiles, reads: boolean): Stray {
  const { files } = tenantFiles
  const stray: Stray = { removed: [], listed: [], folded: [], refused: [], temporary: 0 }
  const rows = new Map(rowsIn(files.shared).map((row) => [fileKeyOf(row.file), row]))
  const standing = new Set<string>()
  /** The upkeep of one place of the walk. */
  const kept = (file: FileName): void => {
    const path = files.path(file)
    const open = tenantFiles.isOpen(file)
    const listed = rows.has(fileKeyOf(file))
    if (!open) {
      if (!reads && besideAside(tenantFiles, file)) stray.refused.push(file.id)
      // What is no data file is opened by nothing: a writer removes it or moves it aside, and a reader leaves it.
      // A file that the directory lists is looked at, and one that it does not list is asked what it is.
      const did = reads ? undefined : borne(o, tenantFiles, file, !listed)
      if (did) stray[did].push(file.id)
      if (did || isNone(o, tenantFiles, file, false)) return
    }
    // The write-ahead file may hold writes that were committed: it is never removed, and folded by an opening that may write.
    if (!open && hasBeside(path)) {
      const store = tenantFiles.store()
      store.open(path)
      store.close()
      stray.folded.push(file.id)
    }
    if (reads) return
    if (files.shared.read({ from: file.table, one: 'get', id: file.id }, system).value === undefined) {
      files.remove(file)
      stray.removed.push(file.id)
      return
    }
    standing.add(fileKeyOf(file))
    if (listed || open) return
    const said = tenantFiles.peek(file)
    if (said && liesElsewhere(said, file)) {
      // A file holds its table and its tenant: under another name it is the file of nobody.
      setAside(path)
      stray.refused.push(file.id)
      tenantFiles.line('error', 'A data file names another tenant than the one it stands under, and was moved aside.', {
        ...file,
        names: said.tenant,
      })
      return
    }
    const fields = { ...saidFields(said), size: sizeOf(path), open: false }
    tenantFiles.sharedWrite((tx) => setRow(tx, file, fields))
    stray.listed.push(file.id)
  }
  for (const file of [...files.walk()])
    try {
      kept(file)
    } catch (error) {
      // One hold around each place: what fails there is said and named, and the walk goes on to the next.
      if (!stray.refused.includes(file.id)) stray.refused.push(file.id)
      tenantFiles.line(
        'error',
        'The upkeep could not work on what lies at the place of a data file of a tenant, and left it.',
        {
          ...file,
          error: String(error),
        },
      )
    }
  // A file under a table that no tenant table names any more, as after its rows moved into the shared file,
  // is named by no directory and opened by nothing: it is removed once it holds no row of the app.
  if (!reads) {
    const kept = new Set(Object.keys(tenantFiles.fingerprints()))
    const root = join(o.dataFolder, 'tenants')
    const tables = existsSync(root) ? readdirSync(root, { withFileTypes: true }) : []
    for (const table of tables.filter((one) => one.isDirectory() && !one.name.startsWith('.') && !kept.has(one.name)))
      for (const two of readdirSync(join(root, table.name), { withFileTypes: true }).filter((one) => one.isDirectory()))
        for (const name of readdirSync(join(root, table.name, two.name)).filter((one) => one.endsWith('.db'))) {
          const path = join(root, table.name, two.name, name)
          const file = { table: table.name, id: name.slice(0, -3) }
          if (
            tenantFiles.isBusy(file) ||
            !mayBeDataFile(path, join(o.dataFolder, 'data.db')) ||
            holdsRows(tenantFiles, path)
          )
            continue
          for (const ending of ['', '-wal', '-shm']) rmSync(`${path}${ending}`, { force: true })
          if (rows.delete(fileKeyOf(file))) tenantFiles.sharedWrite((tx) => removeRow(tx, file))
          stray.removed.push(file.id)
        }
  }
  // A row with no file is a tenant with no file.
  if (!reads)
    for (const [key, row] of rows)
      if (!standing.has(key) && !files.has(row.file)) tenantFiles.sharedWrite((tx) => removeRow(tx, row.file))
  const root = join(o.dataFolder, 'tenants')
  const temporary = temporaryFolder(o.dataFolder)
  // What lies in `.tmp/` is taken away, but what a copy for a reader, a fetch or one tenant being put back holds now.
  for (const name of existsSync(temporary) ? readdirSync(temporary) : []) {
    const path = join(temporary, name)
    if (isHeldTemporary(path)) continue
    stray.temporary += 1
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
  }
  // The folders of the files, two characters each, and the folder of a table: one that holds nothing is removed.
  for (const table of existsSync(root) ? readdirSync(root, { withFileTypes: true }) : []) {
    if (!table.isDirectory()) continue
    for (const two of readdirSync(join(root, table.name), { withFileTypes: true }))
      if (two.isDirectory() && !readdirSync(join(root, table.name, two.name)).length)
        rmdirSync(join(root, table.name, two.name))
    if (!readdirSync(join(root, table.name)).length) rmdirSync(join(root, table.name))
  }
  return stray
}
