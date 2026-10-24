import { callerText } from '../../data/index.ts'
import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { logCall, refusedCall } from '../door/failure.ts'
import { countedFor } from '../door/rate.ts'
import { storedLimit } from '../limits.ts'
import { keyDownloads } from '../keys/files.ts'
import { mayDownload } from '../stored/access.ts'
import type { StoredFile } from '../stored/files.ts'
import { bytesFor, fileRow, fileStore } from '../stored/files.ts'
import { signedUrlOpens } from '../stored/signedUrls.ts'
import { shownInPlace } from '../stored/kind.ts'
import { visitorIn } from '../visitor.ts'
import { decoded } from '../web/decoded.ts'
import { countedAs } from '../web/names.ts'
import { errorAnswer } from '../wire.ts'

const prefix = '/_t/files/'
const name = 'download'

/** The error of a download of a file that is not there, or that is not this caller's to have: the two are told alike. */
const notFound = (): TentError =>
  new TentError('T0001', 'No file of that id can be downloaded.', {
    fix: 'A file is downloaded by whoever may read a row that holds it, and while it is loose by whoever uploaded it.',
  })

/**
 * What every answer of a file says: it can never act as a page of the app, its kind is not to be guessed, and a
 * browser keeps it and asks each time whether this caller may still have it, by the fingerprint as its mark.
 */
export const fileHeaders = (file: StoredFile): Record<string, string> => ({
  'content-security-policy': "default-src 'none'; sandbox",
  'x-content-type-options': 'nosniff',
  'cache-control': 'private, no-cache',
  etag: `"${file.fingerprint}"`,
  'content-type': file.kind,
  // A kind that is not shown in place is sent as a download, under a name in which a quote ends nothing.
  ...(shownInPlace(file.kind)
    ? {}
    : {
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (sign) => `%${sign.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      }),
})

/** The one range of bytes that a request asks for: of several the first, and nothing for a range that cannot be met. */
function rangeOf(asked: string | null, size: number): { from: number; to: number } | undefined {
  const [first] = /^bytes=(.+)$/.exec(asked ?? '')?.[1].split(',') ?? []
  const read = /^\s*(\d*)-(\d*)\s*$/.exec(first ?? '')
  if (!read || (read[1] === '' && read[2] === '')) return undefined
  // The last so many bytes, or from a byte to another, or to the end.
  const from = read[1] === '' ? Math.max(0, size - Number(read[2])) : Number(read[1])
  const to = read[1] === '' || read[2] === '' ? size - 1 : Math.min(Number(read[2]), size - 1)
  return from <= to && from < size ? { from, to } : undefined
}

/**
 * Takes the bytes of a file as its store hands them. Answers them as a stream whose first part has arrived: so
 * bytes that are gone fail before the head of an answer is sent.
 */
export async function firstRead(bytes: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  const reader = bytes.getReader()
  const first = await reader.read()
  let sent = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const part = sent ? await reader.read() : first
      sent = true
      if (part.done) controller.close()
      else controller.enqueue(part.value)
    },
    cancel: () => reader.cancel(),
  })
}

/**
 * `GET /_t/files/<id>`: a download. It passes steps 1 to 4 and 10 of the door, counted on `filesPerMinute` and
 * not on the count of calls, then the rule of a download: anything that is not this caller's to have is not found.
 * A signed address for a time, `?l=<text>`, passes by its seal in place of the rule while it lasts and its file
 * stands. It answers one range of bytes for a request, so that video can seek.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname.startsWith(prefix) && { name },
  steps: [1, 2, 3, 10],
  async handle({ app: o, request, caller, about, began }) {
    try {
      const perMinute = storedLimit(o.description, 'filesPerMinute')
      const who = caller.kind === 'nobody' ? countedAs(about.from) : callerText(caller)
      if (!countedFor(o, `files:${who}`, perMinute))
        throw new TentError('T0005', `More than ${perMinute} files in a minute were asked for by one caller.`, {
          fix: 'Ask for fewer files, or raise `filesPerMinute` in `project.limits`.',
        })
      // An address whose percent signs stand for nothing names no file.
      const url = new URL(request.url)
      const file = fileRow(o, decoded(url.pathname.slice(prefix.length)))
      const signed = url.searchParams.get('l')
      const may =
        file !== undefined &&
        (signed === null
          ? mayDownload(o, caller, file, visitorIn(o, request, about))
          : file.removedAt === undefined && signedUrlOpens(o, file, signed))
      keyDownloads(caller, file, may)
      if (!file || !may) throw notFound()
      const headers = fileHeaders(file)
      if (request.headers.get('if-none-match') === headers.etag) {
        logCall(o, { name, caller, began })
        return new Response(null, { status: 304, headers })
      }
      const range = rangeOf(request.headers.get('range'), file.size)
      // A reader that lacks the bytes fetches them first: one that cannot reach its writer answers T0029.
      await bytesFor(o, file)
      let bytes: ReadableStream<Uint8Array>
      try {
        bytes = await firstRead(fileStore(o).get(file.fingerprint, range))
      } catch {
        // A row whose bytes are gone after all answers as not found, and the log says so.
        o.log.write('lines', {
          at: o.clock.now(),
          level: 'error',
          message: 'The bytes of a file are gone from the file store.',
          data: JSON.stringify({ file: file.id }),
        })
        throw notFound()
      }
      logCall(o, { name, caller, began })
      return new Response(bytes, {
        status: range ? 206 : 200,
        headers: {
          ...headers,
          'accept-ranges': 'bytes',
          'content-length': String(range ? range.to - range.from + 1 : file.size),
          ...(range ? { 'content-range': `bytes ${range.from}-${range.to}/${file.size}` } : {}),
        },
      })
    } catch (error) {
      refusedCall(o, name, caller, began, error)
      return errorAnswer(o, name, error)
    }
  },
}
