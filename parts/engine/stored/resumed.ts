import { randomBytes } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { TentError } from '../../core/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { streamed } from '../web/streamed.ts'
import type { Putting, StoredFile } from './files.ts'
import { fileStore, forgetFile, putFile } from './files.ts'

/**
 * One upload that is sent in parts, or straight to a store, as the engine keeps it while it is under way: what it
 * will be made of, the length it stated, the `file` field it is meant for, and for one that goes straight to a
 * store the name its bytes lie under there.
 */
export interface UploadUnderway {
  how: Putting
  size: number
  for?: string
  field?: string
  direct?: string
}

/** What is kept of an upload under way: itself, and the moment its last part came. */
interface Kept extends UploadUnderway {
  at: number
}

const isKept = (value: unknown): value is Kept =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'size') === 'number' &&
  typeof Reflect.get(value, 'at') === 'number' &&
  typeof Reflect.get(Object(Reflect.get(value, 'how')), 'by') === 'string'

// How long an address of a store for one upload lasts: long enough to send a large file, and no longer.
const directSeconds = 600

/** The folder that the uploads under way of a data folder are kept in, each its bytes and what it is. */
const folderOf = (o: Opened): string => join(o.dataFolder, 'files', '.underway')

const recordOf = (o: Opened, id: string): string => join(folderOf(o), `${id}.json`)
const partOf = (o: Opened, id: string): string => join(folderOf(o), `${id}.part`)

/** The error of an upload id that names nothing for this caller: one that is not there and one of another are told alike. */
const unknown = (): TentError =>
  new TentError('T0001', 'No upload under way has that id.', {
    fix: 'Begin the upload anew: an upload is named by the caller who began it, for `limits.uploadResume` after its last part.',
  })

/** Reads what is kept of an upload under way, or nothing. */
function keptOf(o: Opened, id: string): Kept | undefined {
  try {
    const held: unknown = JSON.parse(readFileSync(recordOf(o, id), 'utf8'))
    return isKept(held) ? held : undefined
  } catch {
    return undefined
  }
}

/** Takes an upload under way away, its bytes with it. */
function ended(o: Opened, id: string): void {
  rmSync(partOf(o, id), { force: true })
  rmSync(recordOf(o, id), { force: true })
}

/**
 * Answers every upload under way that stands, and takes away each whose last part came longer ago than
 * `limits.uploadResume`, with what arrived of it. One that went straight to a store leaves its bytes there to the
 * store: they lie under a name that no file is kept under.
 */
function standing(o: Opened): Kept[] {
  const folder = folderOf(o)
  if (!existsSync(folder)) return []
  const before = o.clock.now() - storedLimit(o.description, 'uploadResume')
  const kept: Kept[] = []
  for (const name of readdirSync(folder)) {
    if (!name.endsWith('.json')) continue
    const id = name.slice(0, -'.json'.length)
    const one = keptOf(o, id)
    if (one && one.at >= before) kept.push(one)
    else ended(o, id)
  }
  return kept
}

/**
 * The bytes that the uploads under way of one owner state, and with an address those of a caller who is nobody
 * behind it, and of all of them: they count toward the loose bytes, as an upload that arrives whole does.
 */
export function underwayBytes(o: Opened, by: string, address?: string): { own: number; all: number } {
  let [own, all] = [0, 0]
  for (const one of standing(o)) {
    all += one.size
    if (one.how.by === by || (address !== undefined && one.how.address === address)) own += one.size
  }
  return { own, all }
}

/** What an upload under way is, for the caller who names it. Throws T0001 for an id that names none of theirs. */
function underwayOf(o: Opened, id: string, by: string): Kept {
  if (!/^[0-9a-f]{32}$/.test(id)) throw unknown()
  standing(o)
  const held = keptOf(o, id)
  if (!held || held.how.by !== by) throw unknown()
  return held
}

/** How many bytes of an upload in parts have arrived. */
const offsetOf = (o: Opened, id: string): number => (existsSync(partOf(o, id)) ? statSync(partOf(o, id)).size : 0)

/** Keeps what an upload under way is, from this moment. */
const keep = (o: Opened, id: string, underway: UploadUnderway): void =>
  writeFileSync(recordOf(o, id), JSON.stringify({ ...underway, at: o.clock.now() }))

/**
 * Begins an upload that is sent in parts: what it is made of is kept under an id of 32 random characters, which
 * only its caller can name. Answers the id. With `direct`, where the store of the files hands out addresses, the
 * bytes go straight to the store: the answer holds an address of the store for this one upload, signed for ten
 * minutes with its size and its kind. Where the store hands out none, the upload is sent in parts.
 */
export async function beginUpload(
  o: Opened,
  underway: UploadUnderway,
  direct: boolean,
): Promise<{ upload: string; offset: number } | { upload: string; address: string; until: number }> {
  standing(o)
  const id = randomBytes(16).toString('hex')
  mkdirSync(folderOf(o), { recursive: true })
  const store = fileStore(o)
  if (direct && store.direct) {
    // The bytes lie in the store under a name of their own until they are read, and then under their fingerprint.
    const name = randomBytes(32).toString('hex')
    const kind = underway.how.kind ?? 'application/octet-stream'
    const address = await store.direct(name, { size: underway.size, kind }, directSeconds)
    keep(o, id, { ...underway, direct: name })
    return { upload: id, address, until: o.clock.now() + directSeconds * 1000 }
  }
  keep(o, id, underway)
  return { upload: id, offset: 0 }
}

/** Where an upload in parts of this caller stands: how many of its bytes have arrived. Throws T0001. */
export function uploadAt(o: Opened, id: string, by: string): { upload: string; offset: number; direct: boolean } {
  const underway = underwayOf(o, id, by)
  return { upload: id, offset: underway.direct ? 0 : offsetOf(o, id), direct: underway.direct !== undefined }
}

/** The error of a part that does not go on from where its upload stands. */
const notThere = (held: number, said: string): TentError =>
  new TentError('T0002', `The upload stands at ${held} bytes, and ${said}.`, {
    fields: { offset: 'values' },
    fix: 'Ask where the upload stands, with no `Upload-Offset`, and send the bytes from there.',
  })

/**
 * Takes the next part of an upload in parts of this caller, at the offset the caller states, with the length the
 * part states. What arrives is kept as it arrives, so a part that is cut off keeps what came before the cut, and
 * keeps the upload for another `limits.uploadResume`. Answers where the upload stands, or the file once its last
 * byte has arrived, as `done` answers it. Throws T0001 for an id that names none of the caller's, and T0002 for
 * an offset that is not where the upload stands and for a part that was cut off.
 */
export async function uploadPart(
  o: Opened,
  part: { id: string; by: string; offset: number; length: number; bytes: ReadableStream<Uint8Array> | null },
  done: (file: StoredFile, underway: UploadUnderway) => Promise<StoredFile>,
): Promise<{ upload: string; offset: number } | StoredFile> {
  const { id } = part
  const underway = underwayOf(o, id, part.by)
  if (underway.direct) throw notThere(0, 'its bytes go to the store')
  // One part of an upload arrives at a time. A sender that took a part for lost sends the next: the part that
  // is still arriving is stopped, and has ended, before the offset is read.
  const place = partOf(o, id)
  const before = arriving.get(place)
  if (before) {
    before.stop.abort()
    await before.ended
  }
  const stop = new AbortController()
  let end = (): void => undefined
  const mine = { stop, ended: new Promise<void>((ends) => (end = ends)) }
  arriving.set(place, mine)
  try {
    return await partTaken(o, part, underway, stop.signal, done)
  } finally {
    if (arriving.get(place) === mine) arriving.delete(place)
    end()
  }
}

// The part of each upload in parts that is arriving now, by the file its bytes are kept in.
const arriving = new Map<string, { stop: AbortController; ended: Promise<void> }>()

/** One part of an upload in parts, while no other part of it arrives: as `uploadPart` says. */
async function partTaken(
  o: Opened,
  part: { id: string; offset: number; length: number; bytes: ReadableStream<Uint8Array> | null },
  underway: Kept,
  signal: AbortSignal,
  done: (file: StoredFile, underway: UploadUnderway) => Promise<StoredFile>,
): Promise<{ upload: string; offset: number } | StoredFile> {
  const { id } = part
  const held = offsetOf(o, id)
  if (part.offset !== held) throw notThere(held, `the part states ${part.offset}`)
  let left = underway.size - held
  const out = createWriteStream(partOf(o, id), { flags: 'a' })
  // The bytes past the stated length are not taken: an upload is closed at its length.
  const kept = new Writable({
    write(chunk: Buffer, _encoding, next) {
      const take = chunk.subarray(0, Math.max(0, left))
      left -= take.length
      if (take.length) out.write(take, next)
      else next()
    },
  })
  try {
    if (part.bytes) await part.bytes.pipeTo(Writable.toWeb(kept), { signal })
  } catch (error) {
    if (!signal.aborted) throw error
  } finally {
    await new Promise<void>((closed) => out.end(closed))
    keep(o, id, underway)
  }
  const now = offsetOf(o, id)
  if (signal.aborted) throw notThere(now, 'another part of it took the place of this one')
  if (now < underway.size && now - held < part.length) throw notThere(now, 'the part was cut off')
  if (now < underway.size) return { upload: id, offset: now }
  const file = await putFile(o, streamed(createReadStream(partOf(o, id))), underway.how)
  ended(o, id)
  return done(file, underway)
}

/** Reads the bytes a store holds under a name, or answers nothing while it holds none. */
async function heldBytes(o: Opened, name: string): Promise<ReadableStream<Uint8Array> | undefined> {
  let reader: ReadableStreamDefaultReader<Uint8Array>
  let first: ReadableStreamReadResult<Uint8Array>
  try {
    reader = fileStore(o).get(name).getReader()
    first = await reader.read()
  } catch {
    return undefined
  }
  let sent = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = sent ? await reader.read() : first
      sent = true
      if (next.done) controller.close()
      else controller.enqueue(next.value)
    },
    cancel: () => reader.cancel(),
  })
}

/**
 * Takes in an upload of this caller that went straight to the store, once the store holds its bytes: they are
 * read for their fingerprint and their kind, as the bytes of any upload are, and are held to the size and the kind
 * that were stated. Answers the file, as `done` answers it. Throws T0001 for an id that names none of the
 * caller's, and T0002 while the store holds no bytes of it, and where its bytes are not what was stated: the
 * upload is then given up, with its bytes.
 */
export async function directTaken(
  o: Opened,
  id: string,
  by: string,
  done: (file: StoredFile, underway: UploadUnderway) => Promise<StoredFile>,
): Promise<StoredFile> {
  const underway = underwayOf(o, id, by)
  const name = underway.direct
  if (name === undefined) throw notThere(offsetOf(o, id), 'it is sent in parts')
  const bytes = await heldBytes(o, name)
  if (!bytes)
    throw new TentError('T0002', 'The store holds no bytes of this upload yet.', {
      fields: { upload: 'required' },
      fix: 'Send the bytes to the address of the upload first, and then ask for it again.',
    })
  let file: StoredFile
  try {
    file = await putFile(o, bytes, underway.how)
  } finally {
    ended(o, id)
    await fileStore(o).remove(name)
  }
  // A kind that was stated is held to what the bytes are: the kind of a file is taken from its bytes.
  const stated = underway.how.kind?.split(';')[0].trim().toLowerCase()
  if (
    file.size !== underway.size ||
    (stated !== undefined && stated !== 'application/octet-stream' && file.kind !== stated)
  ) {
    await forgetFile(o, file)
    throw new TentError(
      'T0002',
      `The upload stated ${underway.size} bytes of ${stated ?? 'no kind'}, and the store held ${file.size} bytes of ${file.kind}.`,
      { fields: { upload: 'values' } },
    )
  }
  return done(file, underway)
}
