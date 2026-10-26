// Loaded into every test program of the framework's own runs by `scripts/tests.mjs`, and through `NODE_OPTIONS` into
// every program a test starts: notes each source file the program loads and each file and folder it reads, copies,
// opens or lists under the tree that runs, each with its fingerprint as it stood when it was first noted, and the
// words of the environment the test file's own program read, and writes them, as the program ends, where
// `scripts/tests.mjs` keeps them for the next run.
import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import fs from 'node:fs'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { threadId } from 'node:worker_threads'

// The tree that runs, which `scripts/tests.mjs` names, and the test file whose program this is or started it. A
// program that a test file's program started finds the file named by the one that started it.
const tree = process.env.TENT_TOUCHED_TREE
const started = process.env.TENT_TOUCHED_OF !== undefined
const of =
  process.env.TENT_TOUCHED_OF ??
  (tree && process.env.NODE_TEST_CONTEXT && process.argv[1]
    ? relative(tree, process.argv[1]).split(sep).join('/')
    : undefined)

// The ways of the files as the runtime gives them, before any is made to note.
const { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } = fs

/** The place of a path under the tree, written with `/`, or nothing for one outside it or of what a run makes. */
function placeOf(path: string): string | undefined {
  if (!tree) return undefined
  const place = relative(tree, resolve(path)).split(sep).join('/')
  if (place === '' || place.startsWith('..') || isAbsolute(place)) return undefined
  return /(?:^|\/)(?:results|node_modules|\.git|\.tent)(?:\/|$)/.test(place) ? undefined : place
}

const print = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/**
 * The fingerprint of a path as it stands, as `scripts/tests.mjs` makes it: a file by its bytes, a folder by its
 * names, and anything else, as a pipe that would hold a read for ever, as none.
 */
function printOf(path: string): string {
  try {
    const kind = statSync(path)
    if (kind.isDirectory()) return print(readdirSync(path).sort().join('\n'))
    return kind.isFile() ? print(readFileSync(path)) : 'none'
  } catch {
    return 'none'
  }
}

// Each place noted, with its fingerprint when it was first noted, and whether a fingerprint is being read now.
const noted = new Map<string, string>()
let printing = false
// Whether the program wrote what the rigs of a run gather, a measure or a picture, which a replay would not give.
let rigs = false

/** The path that a file or a module names, as a text, a URL or bytes; a number names an open file, no path. */
function pathOf(given: unknown): string | undefined {
  if (typeof given === 'string')
    // A module of the runtime, as `node:fs`, and any other address but a file's, is no path of the tree.
    return given.startsWith('file:') ? fileURLToPath(given) : /^[a-z][a-z0-9+.-]+:/i.test(given) ? undefined : given
  if (given instanceof URL) return given.protocol === 'file:' ? fileURLToPath(given) : undefined
  return Buffer.isBuffer(given) ? given.toString() : undefined
}

/** Notes a path with its fingerprint as it stands, where it lies under the tree and was not noted before. */
function note(given: unknown): void {
  // The runtime may read a file through the very ways that note: what a fingerprint reads is noted already.
  if (printing) return
  const path = pathOf(given)
  const place = path === undefined ? undefined : placeOf(path)
  if (path === undefined || place === undefined || noted.has(place)) return
  printing = true
  try {
    noted.set(place, printOf(path))
  } finally {
    printing = false
  }
}

/** Notes a path that is copied: a folder by itself and every file and folder in it. */
function noteCopied(given: unknown): void {
  const path = pathOf(given)
  if (path === undefined) return
  note(path)
  let inside: Dirent[] = []
  try {
    inside = readdirSync(path, { recursive: true, withFileTypes: true })
  } catch {
    // A file, or nothing there: noted as itself.
  }
  for (const one of inside) note(join(one.parentPath, one.name))
}

/** Notes a write into `results/parts/` of the tree, where the rigs of a run leave what they found. */
function noteWritten(given: unknown): void {
  const path = pathOf(given)
  if (tree && path !== undefined && relative(join(tree, 'results', 'parts'), resolve(path)).split(sep)[0] !== '..')
    rigs = true
}

/** Notes what a listing by a pattern found: a path, or an entry with its folder. */
function noteFound(found: unknown, cwd: unknown): void {
  const at = typeof cwd === 'string' ? cwd : process.cwd()
  if (typeof found === 'string') note(resolve(at, found))
  else if (found instanceof fs.Dirent) note(join(found.parentPath, found.name))
}

// The words of the environment the test file's own program read, each with its value as the program began. A copy
// of the whole environment, as a program hands it to one it starts, reads no word: it reads each one's entry first.
const words = new Map<string, string | null>()
if (tree && of && !started) {
  const began = { ...process.env }
  // The word whose entry was last read: a copy reads a word's entry and then the word itself, at once.
  let described: string | symbol | undefined
  // The words that the run itself sets for the runner.
  const own = new Set(['NODE_TEST_CONTEXT', 'TENT_TOUCHED_OF', 'TENT_TOUCHED_TREE'])
  const read = (word: string | symbol): void => {
    if (typeof word === 'string' && !own.has(word) && !words.has(word)) words.set(word, began[word] ?? null)
  }
  process.env = new Proxy(process.env, {
    get(target, word, receiver) {
      if (word === described) described = undefined
      else read(word)
      return Reflect.get(target, word, receiver)
    },
    // A word is set on the environment itself, which takes a value alone.
    set: (target, word, value) => Reflect.set(target, word, value),
    has(target, word) {
      read(word)
      return Reflect.has(target, word)
    },
    getOwnPropertyDescriptor(target, word) {
      described = word
      return Reflect.getOwnPropertyDescriptor(target, word)
    },
  })
}

if (tree && of) {
  process.env.TENT_TOUCHED_OF = of
  // A program that a test starts carries this hook too, and notes under the same test file.
  const hook = `--import=${new URL(import.meta.url).href}`
  if (!(process.env.NODE_OPTIONS ?? '').includes(hook))
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} ${hook}`.trim()
  registerHooks({
    load(url, context, next) {
      note(url.split('?')[0])
      return next(url, context)
    },
  })
  /** Has each way of `owner` that `names` names call `before` with what it is handed first. */
  const noting = (owner: object, names: string[], before: (given: unknown[]) => void): void => {
    for (const name of names) {
      const own: unknown = Reflect.get(owner, name)
      if (typeof own !== 'function') continue
      const way = function (this: unknown, ...given: unknown[]): unknown {
        before(given)
        return Reflect.apply(own, this, given)
      }
      // What a way carries beside itself, as `realpathSync.native`, it carries on.
      Reflect.set(owner, name, Object.assign(way, own))
    }
  }
  const sync = (names: string[]): string[] => [...names, ...names.map((one) => `${one}Sync`)]
  const reads = ['readFile', 'readdir', 'stat', 'lstat', 'access', 'opendir', 'realpath']
  noting(fs, [...sync(reads), 'existsSync', 'createReadStream'], (given) => note(given[0]))
  noting(fs.promises, reads, (given) => note(given[0]))
  // A file opened to be read; one opened to be written is what the test makes, as its other writes are.
  const toRead = (given: unknown[]): void => {
    if (given[1] === undefined || typeof given[1] === 'function' || given[1] === 'r' || given[1] === 0) note(given[0])
  }
  noting(fs, sync(['open']), toRead)
  noting(fs.promises, ['open'], toRead)
  noting(fs, sync(['cp', 'copyFile']), (given) => noteCopied(given[0]))
  noting(fs.promises, ['cp', 'copyFile'], (given) => noteCopied(given[0]))
  noting(fs, ['writeFileSync', 'writeFile'], (given) => noteWritten(given[0]))
  // A listing by a pattern notes each path it found.
  const globSync = fs.globSync
  Reflect.set(fs, 'globSync', (pattern: string | string[], options?: { cwd?: string }) => {
    const found: unknown[] = Reflect.apply(globSync, fs, [pattern, options ?? {}])
    for (const one of found) noteFound(one, options?.cwd)
    return found
  })
  const glob = fs.glob
  Reflect.set(fs, 'glob', (pattern: string | string[], ...rest: unknown[]) => {
    const options: unknown = typeof rest[0] === 'function' ? {} : rest[0]
    const done: unknown = rest.at(-1)
    const cwd: unknown = Reflect.get(Object(options), 'cwd')
    return Reflect.apply(glob, fs, [
      pattern,
      options,
      (error: unknown, found: unknown[]) => {
        for (const one of found ?? []) noteFound(one, cwd)
        if (typeof done === 'function') Reflect.apply(done, undefined, [error, found])
      },
    ])
  })
  const promisedGlob = fs.promises.glob
  Reflect.set(fs.promises, 'glob', async function* (pattern: string | string[], options?: { cwd?: string }) {
    for await (const one of Reflect.apply(promisedGlob, fs.promises, [pattern, options ?? {}])) {
      noteFound(one, options?.cwd)
      yield one
    }
  })
  syncBuiltinESMExports()
  process.once('exit', () => {
    const folder = join(tree, 'results', 'touched')
    mkdirSync(folder, { recursive: true })
    writeFileSync(
      join(folder, `${process.pid}-${threadId}.json`),
      JSON.stringify({
        of,
        files: Object.fromEntries([...noted].sort(([a], [b]) => (a < b ? -1 : 1))),
        env: Object.fromEntries(words),
        rigs,
      }),
    )
  })
}
