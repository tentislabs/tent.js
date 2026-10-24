import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { FileName, Store } from '../../data/index.ts'
import { NotReady } from '../../data/index.ts'
import type { Reached } from '../copy/reach.ts'
import { writtenTo } from '../copy/fetch.ts'
import { heldTemporary } from './temporary.ts'
import { notReached } from '../copy/reach.ts'
import type { Opened } from '../opened.ts'
import type { TenantFiles } from './face.ts'
import type { RowFields } from './directory.ts'
import { removeRow, rowsIn, saidFields, setRow, directoryTable as directory } from './directory.ts'
import type { Said } from './held.ts'
import { metaOf } from '../held.ts'
import { fileLimit, saidBy, sizeOf } from './held.ts'

/** What fetches the bytes of one tenant's file from the writer into a file of this machine, as they arrive. */
export type FetchFile = (file: FileName, to: string) => Promise<void>

/** The address of one tenant's file among the addresses of the link. */
export const fileAddress = (file: FileName): string =>
  `/_t/copy/data?table=${encodeURIComponent(file.table)}&id=${encodeURIComponent(file.id)}`

/**
 * Takes what reaches the writer, its address, and the key of this reader. Answers what fetches the bytes of one
 * tenant's file into a file, piece by piece. It throws T0001 where the writer holds no file of that tenant, and
 * T0029 where the writer is not reached or the file did not arrive whole: no half file is left then.
 */
export function fetching(reached: Reached, address: string, key: string): FetchFile {
  return async (file, to) => {
    const headers = { authorization: `Bearer ${key}`, 'accept-encoding': 'identity' }
    let answer: Response
    let arrived: number
    try {
      answer = await reached.request(new Request(`${address}${fileAddress(file)}`, { headers }))
      if (answer.status === 404) {
        await answer.body?.cancel()
        throw new TentError('T0001', `The writer holds no data file of ${file.table} ${file.id}.`)
      }
      arrived = await writtenTo(answer, to)
    } catch (error) {
      rmSync(to, { force: true })
      if (error instanceof TentError) throw error
      throw notReached(address, error instanceof Error ? error.message : String(error))
    }
    const length = Number(answer.headers.get('content-length') ?? Number.NaN)
    if (!answer.ok || length !== arrived || length === 0) {
      rmSync(to, { force: true })
      throw notReached(address, `the data file of ${file.table} ${file.id} did not arrive whole`)
    }
  }
}

/** The fields of the row of a file that was just fetched and that nothing holds open: what it says of itself, and its size. */
const fieldsOf = (said: Said | undefined, path: string): RowFields => ({
  ...saidFields(said),
  size: sizeOf(path),
  open: false,
  failed: null,
})

/** Puts a fetched file in the place of a data file that nothing holds open. */
function placed(part: string, path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  for (const ending of ['', '-wal', '-shm']) rmSync(`${path}${ending}`, { force: true })
  renameSync(part, path)
}

/**
 * Takes what the engine holds of a reader, its files, one tenant's file, and what fetches its bytes. Fetches
 * the file from the writer and puts it in the place of the one that stands, and writes its row of the directory.
 * The log says which file it was. It is for work on that file that is under way already, one piece at a time.
 * `open` says that more work on the file waits: its row stays marked.
 */
export async function fetchNow(
  o: Opened,
  tenantFiles: TenantFiles,
  file: FileName,
  fetch: FetchFile,
  open = false,
): Promise<void> {
  // The bytes are written under `tenants/.tmp/` as they arrive, and the file is put in place whole.
  const held = heldTemporary(o.dataFolder, 'fetch', '.db')
  const path = tenantFiles.files.path(file)
  try {
    await fetch(file, held.path)
    // A reader that was closed while the bytes were on their way puts nothing in place: its stores are closed.
    if (o.closed) {
      rmSync(held.path, { force: true })
      throw new Error('The reader was closed while it fetched the file.')
    }
    if (tenantFiles.isOpen(file)) tenantFiles.files.close(file)
    placed(held.path, path)
  } finally {
    held.free()
  }
  const fields = { ...fieldsOf(tenantFiles.peek(file), path), open }
  tenantFiles.sharedWrite((tx) => setRow(tx, file, fields))
  tenantFiles.line('info', 'The data file of a tenant was fetched from the writer.', file)
}

/**
 * Takes what the engine holds of an app, its files and one tenant's file. Answers the bytes of a snapshot of
 * that file, made under `tenants/.tmp/` and removed again. A file that is behind or unswept is made ready first.
 * Throws T0001 for a tenant with no file.
 */
export async function tenantFileCopy(
  o: Opened,
  tenantFiles: TenantFiles,
  file: FileName,
): Promise<{ copy: string; remove(): void }> {
  const none = (): TentError =>
    new TentError('T0001', 'No data file stands under that table and that id.', {
      fix: 'A reader asks for the files that the directory of its writer names.',
    })
  let store: Store | undefined
  try {
    store = tenantFiles.files.of(file)
  } catch (error) {
    if (!(error instanceof NotReady)) throw error
    await tenantFiles.ready(file)
    store = tenantFiles.files.of(file)
  }
  if (!store) throw none()
  const held = heldTemporary(o.dataFolder, 'copy', '.db')
  const copy = held.path
  const remove = (): void => {
    rmSync(copy, { force: true, maxRetries: 20, retryDelay: 50 })
    held.free()
  }
  try {
    await store.snapshot(copy)
    return { copy, remove }
  } catch (error) {
    remove()
    throw error
  }
}

/**
 * Takes a data folder, the file that the shared file of the writer was just fetched to and that nothing holds
 * open, what makes a store, how many files are fetched at once, and what fetches a file. Fetches every file that
 * the directory of the writer names, each under `tenants/.tmp/`. The directory of a reader is its own: in the fetched
 * shared file it is emptied, and filled with a row for each file that was fetched. Answers what puts the fetched
 * files in place, at once, in the place of every file that stood there before: it is called while no store holds
 * a file of the folder open. Handed a name, it keeps the files that stood there under that name beside the data;
 * with none it removes them.
 */
export async function fetchFiles(
  dataFolder: string,
  sharedFile: string,
  make: () => Store,
  atOnce: number,
  fetch: FetchFile,
): Promise<(keptAs?: string) => void> {
  const root = join(dataFolder, 'tenants')
  const staged = join(root, '.tmp', `staged-${randomBytes(6).toString('hex')}`)
  const shared = make()
  shared.open(sharedFile)
  try {
    if (!shared.layout().some((one) => one.name === directory.name)) return () => undefined
    const named = rowsIn(shared).map((row) => row.file)
    const folders: Record<string, unknown> = Object(metaOf(shared, 'tenantFolders'))
    const placeOf = (file: FileName): string =>
      join(String(folders[file.table] ?? file.table), file.id.slice(-2), `${file.id}.db`)
    const queue = [...named]
    const held: { file: FileName; fields: RowFields }[] = []
    const worker = async (): Promise<void> => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const path = join(staged, placeOf(file))
        mkdirSync(dirname(path), { recursive: true })
        try {
          await fetch(file, path)
        } catch (error) {
          // A tenant that was removed meanwhile has no file any more: the change that says so follows.
          if (error instanceof TentError && error.code === 'T0001') continue
          throw error
        }
        const store = make()
        store.open(path, { readOnly: true, lazy: true })
        try {
          held.push({ file, fields: fieldsOf(saidBy(store), path) })
        } finally {
          store.close()
        }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, atOnce) }, worker))
    shared.write((tx) => {
      for (const file of named) removeRow(tx, file)
      for (const { file, fields } of held) setRow(tx, file, fields)
    })
    return (keptAs) => {
      const kept = keptAs === undefined ? undefined : join(dataFolder, keptAs)
      if (kept) {
        rmSync(kept, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
        mkdirSync(kept, { recursive: true })
      }
      for (const name of existsSync(root) ? readdirSync(root) : []) {
        if (name === '.tmp') continue
        if (kept) renameSync(join(root, name), join(kept, name))
        else rmSync(join(root, name), { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
      }
      for (const { file } of held) {
        const path = join(root, placeOf(file))
        mkdirSync(dirname(path), { recursive: true })
        renameSync(join(staged, placeOf(file)), path)
      }
      rmSync(staged, { recursive: true, force: true })
    }
  } finally {
    shared.close()
  }
}

/** How many files of tenants a reader fetches at once, by what the description of its app states. */
export const fetchedAtOnce = (o: Pick<Opened, 'description'>): number => fileLimit(o.description, 'filesAtOnce')

// How many it fetches at once before it holds a description: what holds where a project states nothing.
export const fetchedAtFirst = 4
