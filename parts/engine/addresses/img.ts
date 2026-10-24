import { callerText } from '../../data/index.ts'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { logCall, refusedCall } from '../door/failure.ts'
import { countedFor } from '../door/rate.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import type { Scaled } from '../pictures/scaled.ts'
import { scaledOf } from '../pictures/scaled.ts'
import { keyDownloads } from '../keys/files.ts'
import { mayDownload } from '../stored/access.ts'
import { bytesFor, fileRow, fileStore, wholeBytes } from '../stored/files.ts'
import { isPicture } from '../stored/kind.ts'
import { visitorIn } from '../visitor.ts'
import { decoded } from '../web/decoded.ts'
import { countedAs } from '../web/names.ts'
import { streamed as streamedFrom } from '../web/streamed.ts'
import { errorAnswer } from '../wire.ts'
import { fileHeaders, firstRead } from './file.ts'
import { fileAt, holdsFile } from '../files.ts'

const prefix = '/_t/img/'
const name = 'image'

// The widths that the door scales a picture down to, where the project states none.
const widths = [320, 640, 960, 1280, 1920, 2560]

const kinds: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}

const bad = (words: string, field: string): TentError =>
  new TentError('T0002', words, { fields: { [field]: 'values' } })

const notFound = (): TentError =>
  new TentError('T0001', 'No picture of that name or id is served.', {
    fix: 'The image door serves a picture that this caller may download, and an asset that a kept version names.',
  })

/** Holds the width that the door was asked for to the list of the project. Throws T0002 for none and for another. */
function widthOf(o: Opened, asked: URLSearchParams): number {
  const stated: unknown = Reflect.get(Object(o.description.project.images), 'widths')
  const list = Array.isArray(stated) && stated.length ? stated : widths
  const width = Number(asked.get('w') ?? Number.NaN)
  if (!list.includes(width))
    throw bad(`The image door answers a picture at one of the widths ${list.join(', ')}, stated as \`w\`.`, 'w')
  return width
}

/**
 * The asset of a name, with the fingerprint that the address states, as the description of a kept version names
 * it: the file that holds its bytes, and its kind by its name in the bundle, since a version that runs from its list
 * keeps the bytes under their fingerprint alone. A name is found among the named ones, and never walked.
 */
function assetOf(o: Opened, asset: string, fingerprint: string | null): { path: string; kind?: string } | undefined {
  const kept = [o, ...[...(o.versions?.values() ?? [])].map((one) => one.served).reverse()]
  for (const one of kept) {
    const assets: Record<string, unknown> = Object(Reflect.get(one.description, 'assets'))
    const file: unknown = Object.hasOwn(assets, asset) ? Reflect.get(Object(assets[asset]), 'file') : undefined
    if (typeof file !== 'string' || !file.startsWith('assets/')) continue
    // The fingerprint stands between the name and its ending: `assets/logo.<fingerprint>.png`.
    const parts = file.slice(file.lastIndexOf('/') + 1).split('.')
    if (fingerprint !== null && parts.length > 1 && parts.at(asset.includes('.') ? -2 : -1) === fingerprint)
      return holdsFile(one.bundle, file)
        ? { path: fileAt(one.bundle, file), kind: kinds[file.slice(file.lastIndexOf('.') + 1).toLowerCase()] }
        : undefined
  }
  return undefined
}

/** The bytes of a file of the disk as a stream that is read part by part. */
function streamed(path: string): ReadableStream<Uint8Array> {
  return streamedFrom(createReadStream(path))
}

/** Every answer of the door can never act as a page of the app. */
const locked = { 'content-security-policy': "default-src 'none'; sandbox", 'x-content-type-options': 'nosniff' }

/** The headers of a scaled copy, beside those of the picture: its kind, its mark, and whether it hangs on `Accept`. */
const scaledHeaders = (headers: Record<string, string>, scaled: Scaled, mark: string): Record<string, string> => ({
  ...headers,
  'content-type': scaled.kind,
  'content-length': String(scaled.bytes.byteLength),
  ...(headers.etag === undefined ? {} : { etag: `"${mark}.${scaled.kind.slice('image/'.length)}"` }),
  ...(scaled.vary ? { vary: 'Accept' } : {}),
})

/**
 * `GET /_t/img/<id>?w=<width>` for a file of the app, and `GET /_t/img/a/<name>?w=<width>&v=<fingerprint>` for an
 * asset. A file holds to the rule of a download first, and counts on `filesPerMinute`; an asset is open to
 * everyone, counts on nothing, and is answered to be kept for a year. The door answers the picture scaled down to
 * the width where the resizer is there, in the format that the browser takes where that is smaller: while that
 * part is not, it starts its fetch and sends the picture as it is, and never fails for it. Anything else it is
 * asked is T0002.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname.startsWith(prefix) && { name },
  steps: [1, 2, 3, 10],
  async handle({ app: o, request, caller, about, began }) {
    try {
      const url = new URL(request.url)
      // An address whose percent signs stand for nothing names no picture.
      const asked = decoded(url.pathname.slice(prefix.length))
      if (asked === undefined) throw notFound()
      const accept = request.headers.get('accept')
      if (asked.startsWith('a/')) {
        const width = widthOf(o, url.searchParams)
        const print = url.searchParams.get('v')
        const found = assetOf(o, asked.slice(2), print)
        const kind = found?.kind
        if (found === undefined || kind === undefined) throw notFound()
        const { path } = found
        let size: number
        try {
          size = statSync(path).size
        } catch {
          throw notFound()
        }
        const headers = { ...locked, 'content-type': kind, 'cache-control': 'public, max-age=31536000, immutable' }
        const scaled = await scaledOf(
          o,
          {
            fingerprint: `a.${print}`,
            kind,
            bytes: async () => new Uint8Array(readFileSync(path)),
          },
          width,
          accept,
        )
        if (scaled) return new Response(new Uint8Array(scaled.bytes), { headers: scaledHeaders(headers, scaled, '') })
        return new Response(streamed(path), { headers: { ...headers, 'content-length': String(size) } })
      }
      // A web address in place of an id, and whatever else has not the form of an id, names no file of the app.
      if (!/^[0-9a-hjkmnp-tv-z]{26}$/.test(asked)) throw bad('The image door takes the id of a file of the app.', 'id')
      const width = widthOf(o, url.searchParams)
      const perMinute = storedLimit(o.description, 'filesPerMinute')
      const who = caller.kind === 'nobody' ? countedAs(about.from) : callerText(caller)
      if (!countedFor(o, `files:${who}`, perMinute))
        throw new TentError('T0005', `More than ${perMinute} files in a minute were asked for by one caller.`, {
          fix: 'Ask for fewer files, or raise `filesPerMinute` in `project.limits`.',
        })
      // The rule of a download comes first: a caller who may not have a file learns nothing of its kind.
      const file = fileRow(o, asked)
      const may = file !== undefined && mayDownload(o, caller, file, visitorIn(o, request, about))
      keyDownloads(caller, file, may)
      if (!file || !may) throw notFound()
      if (!isPicture(file.kind) && file.kind !== 'image/svg+xml')
        throw bad('The image door answers pictures, and this file is none.', 'id')
      const scaled = isPicture(file.kind)
        ? await scaledOf(o, { ...file, bytes: () => wholeBytes(o, file) }, width, accept)
        : undefined
      const headers = scaled
        ? scaledHeaders(fileHeaders(file), scaled, `${file.fingerprint}.${width}`)
        : fileHeaders(file)
      if (request.headers.get('if-none-match') === headers.etag) {
        logCall(o, { name, caller, began })
        return new Response(null, { status: 304, headers })
      }
      if (scaled) {
        logCall(o, { name, caller, began })
        return new Response(new Uint8Array(scaled.bytes), { headers })
      }
      await bytesFor(o, file)
      let bytes: ReadableStream<Uint8Array>
      try {
        bytes = await firstRead(fileStore(o).get(file.fingerprint))
      } catch {
        throw notFound()
      }
      logCall(o, { name, caller, began })
      // A kind that is not shown in place, an SVG among them, is a download here too: a page still draws it.
      return new Response(bytes, { headers: { ...headers, 'content-length': String(file.size) } })
    } catch (error) {
      refusedCall(o, name, caller, began, error)
      return errorAnswer(o, name, error)
    }
  },
}
