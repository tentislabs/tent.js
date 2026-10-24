import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fingerprint as fingerprintOf, TentError } from '../../core/index.ts'
import type { Row, Tx } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import type { FileStore } from '../makers.ts'
import { momentOf } from '../moment.ts'
import type { Opened } from '../opened.ts'
import { forgetCopies } from '../pictures/cache.ts'
import { tinyOf } from '../pictures/scaled.ts'
import { forgetText } from '../readers/textKept.ts'
import { table } from '../tables/files.ts'
import { filesMoved } from '../counts/levels.ts'
import { streamed } from '../web/streamed.ts'
import { folderStore } from './folder.ts'
import { namedStore } from './named.ts'
import { isPicture, kindOf } from './kind.ts'
import { sizeOfPicture } from '../../core/internal.ts'
import { addTo, endSpan, insideSpan, openSpan, spanned } from '../trace/span.ts'

const system = { kind: 'system' } as const

/** One file as its row of `_t_files` holds it. */
export interface StoredFile {
  id: string
  fingerprint: string
  size: number
  kind: string
  name: string
  width?: number
  height?: number
  // Who it belongs to, as a column keeps a caller.
  by: string
  address?: string
  // Since when no row holds it, and since when it is removed, in milliseconds.
  looseAt?: number
  removedAt?: number
  // Of a picture: its tiny blurred copy, as the text of a data address.
  tiny?: string
}

const fileOf = (row: Row): StoredFile => {
  const [looseAt, removedAt] = [momentOf(row.looseAt), momentOf(row.removedAt)]
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    size: Number(row.size),
    kind: String(row.kind),
    name: String(row.name),
    ...(typeof row.width === 'number' ? { width: row.width } : {}),
    ...(typeof row.height === 'number' ? { height: row.height } : {}),
    by: String(row.by),
    ...(typeof row.address === 'string' ? { address: row.address } : {}),
    ...(looseAt === undefined ? {} : { looseAt }),
    ...(removedAt === undefined ? {} : { removedAt }),
    ...(typeof row.tiny === 'string' ? { tiny: row.tiny } : {}),
  }
}

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A visitor as a column keeps one. */
export const visitorOwner = (visitor: string): string => `visitor:${fingerprintOf(visitor).slice(0, 32)}`

// The file store of each app, kept under its handles: every record that the engine holds of one app shares those.
const stores = new WeakMap<object, FileStore>()

/**
 * The store that `files.store` of the project names, made anew for each use: its address and its key are read from
 * their settings and secrets then, so a secret that is set after the app opened is used from then on.
 */
function storeNamed(o: Opened, named: unknown): FileStore {
  return {
    shared: true,
    put: (fingerprint, bytes, info) => namedStore(o, named).put(fingerprint, bytes, info),
    get: (fingerprint, range) => namedStore(o, named).get(fingerprint, range),
    remove: (fingerprint) => namedStore(o, named).remove(fingerprint),
    async direct(name, info, seconds) {
      const store = namedStore(o, named)
      if (!store.direct) throw new TentError('T0009', 'The store of files hands out no address for an upload.')
      return store.direct(name, info, seconds)
    },
  }
}

/**
 * Answers where the bytes of the files of an app lie: the store that a maker made, the one that `files.store` of
 * the project names, or the folder that ships.
 */
export function fileStore(o: Opened): FileStore {
  let store = stores.get(o.handles)
  if (!store) {
    const named: unknown = Reflect.get(Object(o.description.project.files), 'store')
    store = named === undefined ? folderStore(o.dataFolder) : storeNamed(o, named)
    stores.set(o.handles, store)
  }
  return store
}

/** Puts the file store that a maker made in the place of the folder that ships. */
export const setFileStore = (o: Opened, store: FileStore): void => void stores.set(o.handles, store)

/** Answers the row of a file by its id, or nothing for an id that no file has. A removed file is answered with its mark. */
export function fileRow(o: Opened, id: unknown, tx?: Tx): StoredFile | undefined {
  if (typeof id !== 'string' || !/^[0-9a-hjkmnp-tv-z]{26}$/.test(id)) return undefined
  const plan = { from: table.name, one: 'get', id } as const
  const row = tx ? tx.read(plan, system) : o.store.read(plan, system).value
  return isRow(row) ? timed(o, fileOf(row)) : undefined
}

/**
 * A loose file whose time is up is removed from that moment, whenever the engine next looks for such files: so
 * the hour of a loose file ends on the minute, and not with the next look.
 */
function timed(o: Opened, file: StoredFile): StoredFile {
  if (file.removedAt !== undefined || file.looseAt === undefined) return file
  const ends = file.looseAt + storedLimit(o.description, 'looseKept')
  return ends <= o.clock.now() ? { ...file, removedAt: ends } : file
}

/** The loose files that stand: those that no row holds and that are not removed. */
export function looseFiles(o: Opened): StoredFile[] {
  const rows = o.store.read({ from: table.name, where: { col: 'removedAt', empty: true } }, system).value
  const files = (Array.isArray(rows) ? rows : []).map((row) => timed(o, fileOf(row)))
  return files.filter((file) => file.looseAt !== undefined && file.removedAt === undefined)
}

// How many first bytes of a file are kept to tell its kind and the size of a picture.
const headSize = 65_536

/** What a new file is made of: its name, the kind that whoever sent it states, and whom it belongs to. */
export interface Putting {
  name: string
  kind?: string
  by: string
  // The address of a caller who is nobody, for the count of their loose bytes.
  address?: string
  // The most bytes that the file may hold: one more is T0003.
  most?: number
}

/**
 * Takes an app, the bytes of a file as a stream, and what the file is made of. Writes the bytes to a file of
 * their own first, since their fingerprint is known only at their end, takes the kind from the bytes, reads the
 * width and the height of a picture, hands the bytes to the file store under their fingerprint, where the same
 * bytes are kept once, and adds the row of the file, which is loose from that moment. Answers the file. Throws
 * T0003 for one byte more than `most`.
 */
export async function putFile(o: Opened, bytes: ReadableStream<Uint8Array>, how: Putting): Promise<StoredFile> {
  // A file that is written is a span of the trace under way, with its size and its kind.
  const span = openSpan(o, { name: 'written', kind: 'file', inside: true })
  try {
    const file = await insideSpan(span, () => putOnce(o, bytes, how))
    if (span) addTo(span, { size: file.size, type: file.kind })
    endSpan(span)
    return file
  } catch (error) {
    endSpan(span, error)
    throw error
  }
}

/** A file as `putFile` writes it, inside its span. */
async function putOnce(o: Opened, bytes: ReadableStream<Uint8Array>, how: Putting): Promise<StoredFile> {
  // A file is made by the writer alone: a reader that is asked for one hands its request on.
  o.machine.writes('a file that is made')
  const folder = join(o.dataFolder, 'files', '.incoming')
  mkdirSync(folder, { recursive: true })
  const beside = join(folder, randomBytes(12).toString('hex'))
  const hash = createHash('sha256')
  const head: Uint8Array[] = []
  let [size, held] = [0, 0]
  try {
    const out = createWriteStream(beside)
    const closed = new Promise<void>((done) => out.once('close', done))
    // What the disk refuses ends the writing wherever it waits: it is never left to nobody.
    const refused = new Promise<never>((_, failed) => out.once('error', failed))
    refused.catch(() => undefined)
    const reader = bytes.getReader()
    try {
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), refused])
        if (done) break
        size += value.byteLength
        if (how.most !== undefined && size > how.most)
          throw new TentError('T0003', `The file is larger than ${how.most} bytes, the most that is taken.`, {
            fix: 'Send a smaller file, or raise `uploadSize` in `project.limits`.',
          })
        hash.update(value)
        if (held < headSize) {
          head.push(value.subarray(0, headSize - held))
          held += Math.min(value.byteLength, headSize - held)
        }
        // The file is written as fast as the disk takes it, and no faster.
        if (!out.write(value)) await Promise.race([new Promise((drained) => out.once('drain', drained)), refused])
      }
      await Promise.race([new Promise<void>((done) => out.end(done)), refused])
    } catch (error) {
      // An upload that is cut off, too large or refused by the disk leaves no file of the engine open behind it.
      await reader.cancel().catch(() => undefined)
      out.destroy()
      await closed
      throw error
    }
    const first = Buffer.concat(head)
    const fingerprint = hash.digest('hex')
    const kind = kindOf(first, how.kind)
    const picture = isPicture(kind) ? sizeOfPicture(kind, first) : undefined
    // A picture keeps a tiny blurred copy, where the resizer is there already: nothing is fetched for it.
    const tiny = picture
      ? await tinyOf(o, { fingerprint, kind, ...picture, bytes: async () => new Uint8Array(readFileSync(beside)) })
      : undefined
    await fileStore(o).put(fingerprint, streamed(createReadStream(beside)), { size, kind })
    const now = new Date(o.clock.now())
    const { value: row } = o.store.write((tx) =>
      tx.add(
        table.name,
        {
          fingerprint,
          size,
          kind,
          name: how.name,
          ...(picture ? { width: picture.width, height: picture.height } : {}),
          ...(tiny === undefined ? {} : { tiny }),
          by: how.by,
          ...(how.address === undefined ? {} : { address: how.address }),
          looseAt: now,
        },
        system,
      ),
    )
    // The files of the app hold these bytes more from now on.
    filesMoved(o, size)
    return fileOf(row)
  } finally {
    rmSync(beside, { force: true })
  }
}

/** Whether the file store of this machine holds the bytes of a fingerprint. */
export async function holdsBytes(o: Opened, fingerprint: string): Promise<boolean> {
  try {
    const reader = fileStore(o).get(fingerprint).getReader()
    await reader.read()
    await reader.cancel()
    return true
  } catch {
    return false
  }
}

/**
 * Has the bytes of a file lie on this machine before they are read. A reader whose file store is not one that
 * every machine reaches fetches the bytes it lacks from its writer, and keeps them: a near reader fetched them
 * as their row came, and a far reader fetches them the first time it is asked for them. Throws T0029 where the
 * writer cannot be reached.
 */
export async function bytesFor(o: Opened, file: StoredFile): Promise<void> {
  const { reader } = o.machine
  if (!reader || fileStore(o).shared === true || (await holdsBytes(o, file.fingerprint))) return
  await reader.fetchFile({ fingerprint: file.fingerprint, size: file.size, kind: file.kind })
}

/** The bytes of a file, whole, for what cannot read a file itself: a mailer, a reader of its words, the resizer. */
export const wholeBytes = (o: Opened, file: StoredFile): Promise<Uint8Array> =>
  // A file that is read is a span of the trace under way, with its size and its kind.
  spanned(o, { name: 'read', kind: 'file', facts: { size: file.size, type: file.kind }, inside: true }, () =>
    bytesOf(o, file),
  )

/** The bytes of a file, whole, as `wholeBytes` reads them inside its span. */
async function bytesOf(o: Opened, file: StoredFile): Promise<Uint8Array> {
  await bytesFor(o, file)
  const parts: Uint8Array[] = []
  for await (const part of fileStore(o).get(file.fingerprint)) parts.push(part)
  return new Uint8Array(Buffer.concat(parts))
}

/** A text or bytes as a stream of one part. */
export function streamOf(content: Uint8Array | string): ReadableStream<Uint8Array> {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes.byteLength) controller.enqueue(bytes)
      controller.close()
    },
  })
}

/**
 * Takes an app and a file. Takes the row of the file away for good, and its bytes where no other file holds the
 * same ones, with the words that were read of them and the scaled copies of them: the same bytes are kept once,
 * for every upload of them. The workers are told of bytes that go.
 */
export async function forgetFile(o: Opened, file: StoredFile): Promise<void> {
  o.machine.writes('a file that is removed')
  o.store.write((tx) => tx.remove(table.name, file.id, system))
  filesMoved(o, -file.size)
  const same = o.store.read(
    { from: table.name, where: { col: 'fingerprint', is: file.fingerprint }, limit: 1 },
    system,
  ).value
  if (Array.isArray(same) && same.length) return
  await fileStore(o).remove(file.fingerprint)
  // A worker that fetched these bytes for a task removes them too, and no scaled copy of a picture stays.
  o.work?.gone([file.fingerprint])
  forgetText(o.dataFolder, file.fingerprint)
  forgetCopies(o.dataFolder, file.fingerprint)
}
