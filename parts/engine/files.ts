import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fingerprintOf } from '../core/internal.ts'

// The one reader of the files of a version, for every part of the engine. A version is a folder of files, as a
// release bundle and each copy in `versions/` is, or in development the list of its files: each file lies once in
// a store, by the fingerprint of its bytes, and the list stands beside the place of the version as `<place>.json`.
// No folder lies at that place, and its modules are loaded by their places all the same: the runtime's hook answers
// each address under it with the bytes of its file in the store.

/** The list of a version of development: the fingerprint of each of its files by its path, and the store they lie in. */
export interface Listed {
  files: Record<string, string>
  store: string
}

// The list of each place that is one, by the place: a version never changes, so each is read once.
const lists = new Map<string, Listed>()
// The places that are folders, which are never lists.
const folders = new Set<string>()

const isFolder = (place: string): boolean => {
  try {
    return statSync(place).isDirectory()
  } catch {
    return false
  }
}

/** Whether a value is the list of a version, as a build or the engine wrote it. */
function listedOf(value: unknown, place: string): Listed | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const files: unknown = Reflect.get(value, 'files')
  if (typeof files !== 'object' || files === null) return undefined
  const named = Object.entries(files)
  if (!named.every(([, print]) => typeof print === 'string' && /^[0-9a-f]{64}$/.test(print))) return undefined
  const store: unknown = Reflect.get(value, 'store')
  return {
    files: Object.fromEntries(named.map(([path, print]) => [path, String(print)])),
    // A build keeps its store beside its lists; the engine names the store of the list it keeps.
    store: typeof store === 'string' ? store : join(dirname(place), 'files'),
  }
}

/** Takes the place of a version. Answers its list, where it is the list of a version of development. */
export function listAt(place: string): Listed | undefined {
  const at = resolve(place)
  const held = lists.get(at)
  if (held || folders.has(at)) return held
  if (isFolder(at)) {
    folders.add(at)
    return undefined
  }
  let read: unknown
  try {
    read = JSON.parse(readFileSync(`${at}.json`, 'utf8'))
  } catch {
    return undefined
  }
  const found = listedOf(read, at)
  if (found) lists.set(at, found)
  return found
}

/**
 * Takes what a version is given as: the folder of a bundle, or the list a build wrote, `<place>.json`. Answers the
 * place of the version, which a list stands beside.
 */
export const filePlaceOf = (given: string): string =>
  given.endsWith('.json') && !isFolder(given) ? resolve(given.slice(0, -'.json'.length)) : resolve(given)

/** A path of a version with `/` between its parts, as a list names it. */
export const listedPath = (path: string): string => path.split(/[\\/]+/).join('/')

/** Takes the place of a version and the path of one of its files. Answers the file that holds its bytes. */
export function fileAt(place: string, path: string): string {
  const list = listAt(place)
  if (!list) return join(place, path)
  const print = list.files[listedPath(path)]
  if (print === undefined) throw Object.assign(new Error(`The version holds no file ${path}.`), { code: 'ENOENT' })
  return join(list.store, print)
}

/** Whether a version holds a file. */
export function holdsFile(place: string, path: string): boolean {
  const list = listAt(place)
  if (list) return Object.hasOwn(list.files, listedPath(path)) && existsSync(fileAt(place, path))
  const file = join(place, path)
  return existsSync(file) && statSync(file).isFile()
}

/** The bytes of a file of a version. */
export const bytesAt = (place: string, path: string) => readFileSync(fileAt(place, path))

/** The text of a file of a version. */
export const textAt = (place: string, path: string): string => readFileSync(fileAt(place, path), 'utf8')

/** Every file of a folder, by its path from the folder, written with `/`. */
function filesIn(folder: string, under = ''): string[] {
  return readdirSync(join(folder, under), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(folder, `${under}${entry.name}/`) : [`${under}${entry.name}`],
  )
}

/** The paths of the files of a version, in order: all of them, or those under one folder of it. */
export function pathsAt(place: string, under = ''): string[] {
  const list = listAt(place)
  const all = list ? Object.keys(list.files) : isFolder(place) ? filesIn(place) : []
  const prefix = under === '' || under.endsWith('/') ? under : `${under}/`
  return all.filter((path) => path.startsWith(prefix)).sort()
}

// The fingerprints of the files of each folder, by the folder: a version never changes, so they are worked out once.
const printed = new Map<string, Record<string, string>>()

/** The fingerprint of the bytes of each file of a version, by its path. */
export function printsAt(place: string): Record<string, string> {
  const list = listAt(place)
  if (list) return list.files
  const at = resolve(place)
  const held = printed.get(at)
  if (held) return held
  const made = Object.fromEntries(pathsAt(at).map((path) => [path, fingerprintOf(readFileSync(join(at, path)))]))
  printed.set(at, made)
  return made
}

/**
 * Takes the place of a version and one folder of it. Answers where that folder stands, as the addresses of its
 * modules start with it: for a list, a place under which no folder lies.
 */
export const folderAt = (place: string, under: string): string => join(place, under)

/** Takes the place of a version and the path of one of its modules. Answers the address the module is imported by. */
export function moduleAt(place: string, path: string): URL {
  // The list is read first, so that the hook answers for the place before anything of it is asked.
  listAt(place)
  return pathToFileURL(join(place, path))
}

/** Lays one file into a store under its fingerprint, where the store does not hold it yet: by a link, or a copy. */
function stored(store: string, print: string, from: string): void {
  const into = join(store, print)
  if (existsSync(into)) return
  try {
    linkSync(from, into)
  } catch {
    // A disk that holds no links, or a store on another disk: the file is copied, and moved into its place whole.
    const half = `${into}.${process.pid}.half`
    copyFileSync(from, half)
    renameSync(half, into)
  }
}

/**
 * Takes a data folder, the id of a version, and what the version was given as: the list a build wrote, or the
 * folder of a bundle. Writes the list of the version into `versions/<id>.json`, with the store its files lie in:
 * the build's own for a list, and for a folder the store in `versions/files/`, which takes each of its files once.
 * Answers the place of the version.
 */
export function listKept(dataFolder: string, version: string, given: string): string {
  const kept = join(dataFolder, 'versions')
  mkdirSync(kept, { recursive: true })
  const from = filePlaceOf(given)
  let list = listAt(from)
  if (!list) {
    const store = join(kept, 'files')
    mkdirSync(store, { recursive: true })
    const files: Record<string, string> = {}
    for (const [path, print] of Object.entries(printsAt(from))) {
      stored(store, print, join(from, path))
      files[path] = print
    }
    list = { files, store }
  }
  const place = join(kept, version)
  // The list is written whole into its place: one that is read meanwhile is the last one or the new one.
  const half = `${place}.json.${process.pid}.half`
  writeFileSync(half, JSON.stringify({ files: list.files, store: resolve(list.store) }))
  renameSync(half, `${place}.json`)
  lists.delete(resolve(place))
  return place
}

/**
 * Takes the place of a version and a folder. Writes every file of the version into the folder, as a copy, the
 * description last: a folder that holds one holds the whole version.
 */
export function copiedTo(place: string, folder: string): void {
  const last = (path: string): number => Number(path === 'description.json')
  for (const path of pathsAt(place).sort((a, b) => last(a) - last(b))) {
    const into = join(folder, path)
    mkdirSync(dirname(into), { recursive: true })
    copyFileSync(fileAt(place, path), into)
  }
}

/** The place of the listed version that a file lies under, by the places this thread has read lists of. */
function listedUnder(file: string): string | undefined {
  for (const place of lists.keys()) if (file.startsWith(place + sep)) return place
  return undefined
}

/** How the runtime is to read a module of a version, by the end of its name. */
const formatOf = (path: string): string => {
  const ending = path.slice(path.lastIndexOf('.'))
  // A module of TypeScript is read as the runtime reads one, with its types taken out.
  const kinds: Record<string, string> = {
    '.cjs': 'commonjs',
    '.json': 'json',
    '.ts': 'module-typescript',
    '.mts': 'module-typescript',
    '.cts': 'commonjs-typescript',
  }
  return kinds[ending] ?? 'module'
}

/** The file that an address names, without what follows its path, where it is an address of a file. */
function fileOfUrl(url: string): string | undefined {
  if (!url.startsWith('file:')) return undefined
  try {
    const plain = new URL(url)
    plain.search = ''
    plain.hash = ''
    return fileURLToPath(plain)
  } catch {
    return undefined
  }
}

// A module of a listed version, and each import between its files, is found under its place and read from the store.
registerHooks({
  resolve(name, context, next) {
    const relativeName = /^\.\.?\//.test(name)
    const parent = context.parentURL === undefined ? undefined : fileOfUrl(context.parentURL)
    const asked =
      name.startsWith('file:') && context.parentURL !== undefined
        ? fileOfUrl(new URL(name, context.parentURL).href)
        : name.startsWith('file:')
          ? fileOfUrl(name)
          : relativeName && parent !== undefined && context.parentURL !== undefined
            ? fileOfUrl(new URL(name, context.parentURL).href)
            : undefined
    const place = asked === undefined ? undefined : listedUnder(asked)
    if (asked === undefined || place === undefined) return next(name, context)
    const path = listedPath(relative(place, asked))
    // A file the list names is found by its place, also once its store is gone: a module that was loaded from it
    // already, as the page code that every version of a program shares, is not read again.
    if (!Object.hasOwn(lists.get(place)?.files ?? {}, path)) return next(name, context)
    return { url: pathToFileURL(asked).href, format: formatOf(path), shortCircuit: true }
  },
  load(url, context, next) {
    const file = fileOfUrl(url)
    const place = file === undefined ? undefined : listedUnder(file)
    if (file === undefined || place === undefined) return next(url, context)
    const path = listedPath(relative(place, file))
    const format = context.format ?? formatOf(path)
    const bytes = bytesAt(place, path)
    return {
      format,
      source: format === 'json' ? bytes : bytes.toString('utf8'),
      shortCircuit: true,
    }
  },
})
