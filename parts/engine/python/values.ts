import { callerText } from '../../data/index.ts'
import { randomBytes } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, extname, join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { CallContext } from '../context.ts'
import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { mayDownload } from '../stored/access.ts'
import { bytesFor, fileRow, fileStore, putFile } from '../stored/files.ts'
import { storedLimit } from '../limits.ts'
import { isStored } from '../../core/internal.ts'

// The ending of a copy by the kind of its file: Python's own readers take a file by its ending.
const endings: Record<string, string> = {
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/markdown': '.md',
  'text/html': '.html',
  'application/json': '.json',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'video/mp4': '.mp4',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
}

/** A file that Python answered, which is stored once every path of the answer holds. */
class Answered {
  path: string
  constructor(path: string) {
    this.path = path
  }
}

/** The error of a call of a `python` that Python answered in a way the engine does not take. */
export const pythonFailed = (
  message: string,
  fix = 'Mend the code of the `python`: the log holds what it did.',
): TentError => new TentError('T7119', message, { fix })

/**
 * Takes an app, the call context of a call, a file id that it names, and the folder of the call. Lays a copy of the
 * file in the folder, named by the engine with the ending of its kind, after the rule of a download was held for the
 * caller: on a worker the writer holds that rule and hands the bytes. Answers its path. Throws T0001 for a file
 * that the caller may not have.
 */
export async function copyInFolder(o: Opened, cx: CallContext, id: unknown, folder: string): Promise<string> {
  const { caller, remote } = cx
  if (remote?.bytes) {
    const files = remote.handle('files')
    const info: unknown = await Reflect.apply(Reflect.get(files, 'info'), files, [id])
    const kind = String(Reflect.get(Object(info), 'kind') ?? '')
    const path = join(folder, `${randomBytes(8).toString('hex')}${endings[kind.split(';')[0] ?? ''] ?? '.bin'}`)
    writeFileSync(path, await remote.bytes(String(id)))
    return path
  }
  const file = fileRow(o, id)
  if (!file || !mayDownload(o, caller, file))
    throw new TentError('T0001', `No file has the id ${(JSON.stringify(id) ?? 'nothing').slice(0, 60)}.`, {
      fix: 'Name the id of a file that the caller of the call may download.',
    })
  await bytesFor(o, file)
  const path = join(folder, `${randomBytes(8).toString('hex')}${endings[file.kind.split(';')[0] ?? ''] ?? '.bin'}`)
  await pipeline(Readable.from(fileStore(o).get(file.fingerprint)), createWriteStream(path))
  return path
}

/**
 * Takes the stored type of an input and the checked input. Answers it as Python is handed it, plain values all: a
 * date as text in the standard form, a day as its text, and a file as the path of a copy in the folder of the call.
 */
export async function pythonInputFor(
  type: unknown,
  value: unknown,
  file: (id: unknown) => Promise<string>,
): Promise<unknown> {
  if (value === undefined || value === null) return value ?? null
  const kind = Reflect.get(Object(type), 'kind')
  if (kind === 'file') return file(value)
  if (value instanceof Date) return kind === 'day' ? value.toISOString().slice(0, 10) : value.toISOString()
  if (kind === 'list' && Array.isArray(value)) {
    const of: unknown = Reflect.get(Object(type), 'of')
    return Promise.all(value.map((one) => pythonInputFor(of, one, file)))
  }
  if (isStored(value)) {
    const shape: unknown =
      kind === 'object' ? Reflect.get(Object(type), 'shape') : kind === undefined ? type : undefined
    const out: Record<string, unknown> = {}
    for (const [name, one] of Object.entries(value))
      out[name] = await pythonInputFor(isStored(shape) ? shape[name] : undefined, one, file)
    return out
  }
  return value
}

/** Takes a path and a folder. Answers whether the path lies inside the folder, both as the disk holds them once every link is followed. */
export function insideFolder(path: string, folder: string): boolean {
  try {
    const away = relative(realpathSync(folder), realpathSync(path))
    return away !== '' && !away.startsWith('..') && !away.startsWith(sep) && !/^[A-Za-z]:/.test(away)
  } catch {
    return false
  }
}

/**
 * Takes an app, the call context of a call, and the path of a file of the folder of the call. Stores the file as a
 * loose file of the caller and answers its id: on a worker it is posted to the writer, which stores it so.
 */
export async function storedFromFolder(o: Opened, cx: CallContext, path: string): Promise<string> {
  if (cx.remote?.post) {
    const ending = extname(path).toLowerCase()
    const kind = Object.entries(endings).find(([, one]) => one === ending)?.[0]
    return cx.remote.post(new Uint8Array(readFileSync(path)), kind)
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const piece of createReadStream(path)) controller.enqueue(new Uint8Array(Buffer.from(piece)))
      controller.close()
    },
  })
  return (await putFile(o, stream, { name: basename(path), by: callerText(cx.caller) })).id
}

/**
 * Takes an app, the caller, the name of the definition, the stored type of its output, what Python answered, and
 * the folder of the call. Answers the output with each file that Python wrote into the folder stored as a loose
 * file of the caller, by its id. Throws T7119 for a path that lies outside the folder, also after every link is
 * followed, that is no plain file, or whose file is larger than `uploadSize`: nothing is stored then.
 */
export async function outputOf(
  o: Opened,
  cx: CallContext,
  name: string,
  type: unknown,
  value: unknown,
  folder: string,
): Promise<unknown> {
  const files: string[] = []
  const most = storedLimit(o.description, 'uploadSize')
  const walk = (at: unknown, one: unknown, field: string): unknown => {
    const kind = Reflect.get(Object(at), 'kind')
    if (kind === 'file' && typeof one === 'string') {
      if (!existsSync(one) || !insideFolder(one, folder) || lstatSync(one).isSymbolicLink() || !statSync(one).isFile())
        throw pythonFailed(`${name} answered at ${field} a path that is no file of the folder of its call.`)
      if (statSync(one).size > most)
        throw pythonFailed(
          `${name} answered at ${field} a file of ${statSync(one).size} bytes, past \`uploadSize\` of ${most}.`,
        )
      files.push(one)
      return new Answered(one)
    }
    if (kind === 'list' && Array.isArray(one))
      return one.map((item, k) => walk(Reflect.get(Object(at), 'of'), item, `${field}.${k}`))
    if (kind === 'object' && isStored(one)) {
      const shape: unknown = Reflect.get(Object(at), 'shape')
      return Object.fromEntries(
        Object.entries(one).map(([key, item]) => [key, walk(Reflect.get(Object(shape), key), item, `${field}.${key}`)]),
      )
    }
    return one
  }
  const held = walk(type, value, 'value')
  if (!files.length) return held
  // Every path holds before one file is stored: an answer that is refused stores nothing.
  const ids = new Map<string, string>()
  for (const path of files) ids.set(path, await storedFromFolder(o, cx, path))
  const swap = (one: unknown): unknown =>
    one instanceof Answered
      ? ids.get(one.path)
      : Array.isArray(one)
        ? one.map(swap)
        : isStored(one)
          ? Object.fromEntries(Object.entries(one).map(([key, item]) => [key, swap(item)]))
          : one
  return swap(held)
}
