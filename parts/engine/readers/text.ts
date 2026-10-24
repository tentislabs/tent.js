import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { TentError } from '../../core/index.ts'
import { fetchPart } from '../fetchPart.ts'
import { storedLimit } from '../limits.ts'
import type { TextReader } from '../makers.ts'
import type { Opened } from '../opened.ts'
import type { StoredFile } from '../stored/files.ts'
import { wholeBytes as bytesOf } from '../stored/files.ts'
import { isOwn, pdfKind, readAs } from './own.ts'
import { textFolder } from './textKept.ts'
import { fingerprintOf } from '../../core/internal.ts'

// The text readers that the makers of each app made, in the order in which they are asked, kept under the handles
// of the app: every record that the engine holds of one app shares those.
const made = new WeakMap<object, TextReader[]>()

/** Is told at the opening of an app the text readers that its makers made: they are asked before ours. */
export const keepReaders = (o: Opened, readers: TextReader[]): void => void made.set(o.handles, readers)

/** Whether a reader of a builder lists a kind: exactly, or as a kind that ends in `/*`. */
const takes = (reader: TextReader, kind: string): boolean =>
  Array.isArray(reader.kinds) &&
  reader.kinds.some((one) => one === kind || (one.endsWith('/*') && kind.startsWith(one.slice(0, -1))))

const tookTooLong = (): TentError =>
  new TentError('T0008', 'The reading of the file passed `limits.readTime` of the project.', {
    fix: 'Read a smaller file, or raise `readTime` in `project.limits`.',
  })

/** Answers what a piece of work answers, or T0008 once a time is up: `stop` ends the work then. */
async function within<Answer>(work: Promise<Answer>, ms: number, stop?: () => void): Promise<Answer> {
  let timer: NodeJS.Timeout | undefined
  const timeUp = new Promise<never>((_, refuse) => {
    timer = setTimeout(() => {
      stop?.()
      refuse(tookTooLong())
    }, ms)
    timer.unref()
  })
  try {
    return await Promise.race([work, timeUp])
  } finally {
    clearTimeout(timer)
  }
}

/** Reads a file with our own readers, on a thread of its own, which is ended when the time is up. */
function onThread(kind: string, bytes: Uint8Array, most: number, ms: number): Promise<string> {
  const worker = new Worker(new URL('./thread.ts', import.meta.url), { workerData: { kind, bytes, most } })
  const read = new Promise<string>((done, failed) => {
    worker.once('message', (told: unknown) => {
      const text: unknown = Reflect.get(Object(told), 'text')
      if (typeof text === 'string') return done(text)
      const error: Record<string, unknown> = Object(Reflect.get(Object(told), 'error'))
      const fix = typeof error.fix === 'string' ? { fix: error.fix } : {}
      // What the reader refused by a code of ours is told as it is, and anything else is a file that it cannot read.
      failed(
        typeof error.code === 'string'
          ? new TentError(error.code, String(error.message), fix)
          : new TentError('T0015', `The file cannot be read: ${String(error.message)}`, {
              fix: 'Read a file that is whole, of a kind that a reader knows.',
            }),
      )
    })
    worker.once('error', failed)
    worker.once('exit', () => failed(new TentError('T0009', 'The thread that read the file ended with no answer.')))
  })
  return within(read, ms, () => void worker.terminate()).finally(() => void worker.terminate())
}

/**
 * Reads a PDF with the part that is fetched at its first use. The wait for the part has a time of its own, and
 * the time of the reading begins once the part is there. Throws T0016, which names the part, where it cannot be
 * fetched.
 */
async function readPdf(bytes: Uint8Array, ms: number): Promise<string> {
  const folder = await fetchPart('unpdf')
  const { pdfReaderIn } = await import('../borrowed/unpdf.ts')
  const reader = await pdfReaderIn(folder).catch((error) => {
    throw new TentError('T0016', `The part unpdf does not give what reads a PDF: ${String(error)}`)
  })
  // The pages come in order, each ended by a page mark.
  const read = (async () => (await reader(bytes)).map((page) => `${page}\f`).join(''))()
  return within(read, ms)
}

/**
 * Takes an app, and a file that the caller of the call under way may download. Answers a promise of
 * the words of the file. A reader that the makers of the app made is asked first, for the kinds it lists, on the
 * main thread; then our own, on a thread of their own; a PDF is read by its part. Each is held to
 * `limits.readTime`. What was read is kept in `cache/` under the fingerprint of the file and the kind it was read
 * as, so that a second reading costs nothing. Throws T0015 for a kind that no reader knows, T0008 for a reading
 * that passes its time, and T0003 for a packed file that opens to more than `limits.readSize`.
 */
export async function textOf(o: Opened, file: StoredFile): Promise<string> {
  const kind = readAs(file.kind, file.name)
  const key = fingerprintOf(kind).slice(0, 12)
  const folder = textFolder(o.dataFolder)
  const kept = join(folder, `${file.fingerprint}.${key}`)
  if (existsSync(kept)) return readFileSync(kept, 'utf8')
  const ms = storedLimit(o.description, 'readTime')
  const own = (made.get(o.handles) ?? []).find((reader) => takes(reader, kind))
  let text: string
  if (own) text = String(await within(own.read(await bytesOf(o, file), { kind, name: file.name }), ms))
  else if (kind === pdfKind) text = await readPdf(await bytesOf(o, file), ms)
  else if (isOwn(kind)) text = await onThread(kind, await bytesOf(o, file), storedLimit(o.description, 'readSize'), ms)
  else
    throw new TentError('T0015', `No reader knows a file of the kind ${kind.slice(0, 80)}.`, {
      fix: 'Read a text, Markdown, CSV, JSON, HTML, Word or PDF file, or connect a `TextReader` for this kind in `engine.ts`.',
    })
  // The words are written beside their place and then moved into it, so that no reading finds half of them.
  mkdirSync(folder, { recursive: true })
  const beside = `${kept}.${process.pid}.${Math.round(performance.now())}`
  writeFileSync(beside, text)
  renameSync(beside, kept)
  return text
}
