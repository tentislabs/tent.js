import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import type { Opened } from '../opened.ts'
import { keptBytes } from '../keptBytes.ts'
import { askedMark, isSteady, moduleMarkOf, servedOf } from '../moduleMarks.ts'
import { errorAnswer } from '../wire.ts'

const prefix = '/_t/b/'

/** The kind of a file by its ending, as a browser is told it. Any other file is bytes. */
const kinds: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
}

/** The kinds that are text, which are sent packed to a browser that takes it. */
const packs = /^(text\/|application\/json|image\/svg)/

/** Every file under `browser/`, `cli/` and `assets/` that a description names: what was built for a browser and a command line, and the assets. */
export function bundleFiles(description: object): Set<string> {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.startsWith('browser/')) found.add(value)
    } else if (Array.isArray(value)) value.forEach(walk)
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk)
  }
  walk(Reflect.get(description, 'browser'))
  // The modules of the commands written in code, which the runner of the command line fetches.
  const cli: unknown = Reflect.get(Object(Reflect.get(description, 'cli')), 'files')
  if (Array.isArray(cli))
    for (const file of cli) if (typeof file === 'string' && file.startsWith('cli/')) found.add(file)
  for (const asset of Object.values(Object(Reflect.get(description, 'assets')))) {
    const file: unknown = Reflect.get(Object(asset), 'file')
    if (typeof file === 'string' && file.startsWith('assets/')) found.add(file)
  }
  return found
}

/** Packs bytes with Brotli at a quality from 0 to 11, on a thread of the runtime's own. */
async function packed(bytes: Uint8Array, quality: number): Promise<Uint8Array> {
  const { brotliCompress, constants } = await import('node:zlib')
  return new Promise((done, failed) =>
    brotliCompress(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }, (error, made) =>
      error ? failed(error) : done(made),
    ),
  )
}

// The names of the files that a description names, kept for as long as the description is held.
const names = new WeakMap<object, Set<string>>()

// The bytes of the files that were asked for, of every bundle, with each packed beside it once it was asked for so:
// 64 MB together, the one asked for longest ago going first. So a program that runs long, and serves one version
// after another, holds no more of them than this.
const served = keptBytes<{ bytes: Uint8Array; packed?: Promise<Uint8Array> }>(64 * 1024 * 1024)

/**
 * Takes an app, a path, and the mark it was asked with, where it was. Answers the kept version that serves a file at
 * that path: the running one first, and then each older version that is still kept, the newest first. So a page of
 * an older version finds the files that it loads late; and a module of development, whose address is the same in
 * every version, is served by the version in which it has the mark that was asked. Nothing where no kept version
 * names the path, nor where none holds the module at that mark.
 */
function versionOf(app: Opened, path: string, mark?: string): Opened | undefined {
  const kept = [app, ...[...(app.versions?.values() ?? [])].map((one) => one.served).reverse()]
  const first = versionNaming(app, kept, path)
  const module = moduleOf(path)
  if (mark === undefined || !first || !isSteady(first, module)) return first
  return kept.find((one) => isSteady(one, module) && moduleMarkOf(one, module) === mark)
}

/** The module that a path serves, or whose source map it is: a map is found and kept as its module is. */
const moduleOf = (path: string): string => (path.endsWith('.map') ? path.slice(0, -'.map'.length) : path)

/** The first of the versions that names a path. */
function versionNaming(app: Opened, kept: Opened[], path: string): Opened | undefined {
  for (const one of kept) {
    let known = names.get(one.description)
    if (!known) {
      known = bundleFiles(one.description)
      names.set(one.description, known)
    }
    // The map of a file that a development build wrote lies beside it, and is served with it in development alone.
    const mapped = app.mode === 'development' && path.endsWith('.map') && known.has(path.slice(0, -4))
    if (known.has(path) || mapped) return one
  }
  return undefined
}

/**
 * `GET /_t/b/<path inside the bundle>`: a file of the bundle that a browser or a command line loads. Only a file
 * under `browser/`, `cli/` or `assets/` that the description of a kept version names is served, and any other address there is not found.
 * The files are the same for every caller: the request passes step 1 of the door and no other, and is answered
 * with a caching time of one year; a module of development at its address with no fingerprint, and its source map,
 * with `no-store`.
 */
export const address: Address = {
  order: 1,
  match: (request) => new URL(request.url).pathname.startsWith(prefix) && { name: 'bundle' },
  steps: [1],
  async handle({ app, request }) {
    try {
      // The address is taken as it was written: a path is found by its name among the named ones, and never walked.
      const asked = new URL(request.url)
      const path = decodeURIComponent(asked.pathname.slice(prefix.length))
      const version = request.method === 'GET' ? versionOf(app, path, askedMark(asked.search)) : undefined
      if (version === undefined) throw notFound(path)
      const bundle = version.bundle
      // A module of development, and its source map, keeps its address while its bytes change.
      const module = moduleOf(path)
      const steady = isSteady(version, module)
      // A file is kept by its bundle and its path: two versions that hold one name hold two files. A module of
      // development is kept by its mark, which names its bytes and those of all it imports, in every version.
      const key = steady ? `${app.name}\n${path}?v=${moduleMarkOf(version, module)}` : `${bundle}\n${path}`
      let file = served.get(key)
      if (!file) {
        const { readFile } = await import('node:fs/promises')
        const { fileAt } = await import('../files.ts')
        const lies = (() => {
          try {
            return fileAt(bundle, path)
          } catch {
            throw notFound(path)
          }
        })()
        const bytes: Uint8Array = await readFile(lies).catch(() => Promise.reject(notFound(path)))
        // A module of development is served with each module it imports, and its source map, named at its mark.
        file = { bytes: steady ? servedOf(version, path, bytes) : bytes }
        served.put(key, file, file.bytes.length)
      }
      const kind = kinds[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream'
      const headers: Record<string, string> = {
        'content-type': kind,
        // A module of development keeps its address while its bytes change: a browser keeps none of it.
        'cache-control': steady ? 'no-store' : 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        // Any site may load a file of the bundle, which is the same for every caller: a frame of a chat app loads
        // the fonts of a screen from here.
        'access-control-allow-origin': '*',
      }
      let bytes = file.bytes
      if (packs.test(kind)) {
        headers.vary = 'Accept-Encoding'
        if (/\bbr\b/.test(request.headers.get('accept-encoding') ?? '')) {
          // A file is packed once, off the thread that answers, and every request for it waits for the same work.
          // A release is packed at its strongest, in every mode, so a browser receives what it does on live data. The
          // files of a development build are large and change at every save: they are packed fast.
          const first = file.packed === undefined
          file.packed ??= packed(file.bytes, version.description.app.dev === true ? 4 : 11)
          bytes = await file.packed
          // What was packed is kept beside the bytes, and counted with them.
          if (first) served.put(key, file, file.bytes.length + bytes.length)
          headers['content-encoding'] = 'br'
        }
      }
      headers['content-length'] = String(bytes.length)
      return new Response(new Uint8Array(bytes), { headers })
    } catch (error) {
      return errorAnswer(app, 'bundle', error instanceof TentError ? error : notFound(''))
    }
  },
}

const notFound = (path: string): TentError =>
  new TentError('T0001', `No file of the bundle is served at ${JSON.stringify(path).slice(0, 120)}.`, {
    fix: 'A page loads the files that its record names, under `browser/` and `assets/`.',
  })
