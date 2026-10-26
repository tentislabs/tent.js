// Loaded into every test program of the framework's own runs by `scripts/tests.mjs`, through `NODE_OPTIONS` into
// every program a test starts, and into every thread of them: notes each source file the program loads and each file
// and folder it reads, copies, opens or lists under the tree that runs, each with its fingerprint as it stood when it
// was first noted, each word of the environment it read as the run handed it, and how long the program ran and the
// most memory it held. It tells them as they come where `scripts/tests.mjs` keeps them for the next run, so that a
// thread that is ended and a program that is killed lose what came in their last moment alone.
import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import fs from 'node:fs'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import workerThreads, { threadId } from 'node:worker_threads'

// The tree that runs, which `scripts/tests.mjs` names, and the test file whose program this is or started it. A
// program that a test file's program started, and a thread of it, finds the file named by the one that started it.
const tree = process.env.TENT_TOUCHED_TREE
const of =
  process.env.TENT_TOUCHED_OF ??
  (tree && process.env.NODE_TEST_CONTEXT && process.argv[1]
    ? relative(tree, process.argv[1]).split(sep).join('/')
    : undefined)

// The ways of the files as the runtime gives them, before any is made to note.
const { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } = fs

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

// Where this program and thread tells what it noted, a line of each, which `scripts/tests.mjs` gathers, and the
// lines not told yet. A file is told a tenth of a second after the first of them, and as the program ends: a write of
// each line alone holds a busy computer, and a thread that is ended loses the files of its last tenth of a second.
let told: string | undefined
let waiting: string[] = []
/** Tells the lines noted since the last telling. */
function flush(): void {
  if (!tree || !waiting.length) return
  if (told === undefined) {
    const folder = join(tree, 'results', 'touched')
    mkdirSync(folder, { recursive: true })
    told = join(folder, `${process.pid}-${threadId}.lines`)
  }
  const lines = waiting.join('')
  waiting = []
  appendFileSync(told, lines)
}
/**
 * Tells one thing noted, with the others noted beside it: a word and a write of the rigs at once, since they are
 * few and a thread is often ended right after it read a word.
 */
function tell(entry: Record<string, unknown>): void {
  if (!tree || !of) return
  if (!waiting.length) setTimeout(flush, 100).unref()
  waiting.push(`${JSON.stringify({ of, ...entry })}\n`)
  if (entry.file === undefined) flush()
}

// Each place noted, and whether a fingerprint is being read now: what it reads is noted already.
const noted = new Set<string>()
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
  noted.add(place)
  printing = true
  try {
    tell({ file: place, print: printOf(path) })
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
  if (rigs || !tree || path === undefined) return
  if (relative(join(tree, 'results', 'parts'), resolve(path)).split(sep)[0] === '..') return
  rigs = true
  tell({ rigs: true })
}

/** Notes what a listing by a pattern found: a path, or an entry with its folder. */
function noteFound(found: unknown, cwd: unknown): void {
  const at = typeof cwd === 'string' ? cwd : process.cwd()
  if (typeof found === 'string') note(resolve(at, found))
  else if (found instanceof fs.Dirent) note(join(found.parentPath, found.name))
}

if (tree && of) {
  // The program tells how long it ran and the most memory it held, as it ends: the profile of a run is made of them.
  // A thread shares its program's memory, and tells nothing of it.
  const top = process.env.TENT_TOUCHED_OF === undefined
  if (threadId === 0)
    process.once('exit', () =>
      tell({
        program: process.pid,
        top,
        ms: Math.round(process.uptime() * 1000),
        peak: process.resourceUsage().maxRSS * 1024,
      }),
    )
  process.once('exit', flush)
  process.env.TENT_TOUCHED_OF = of
  // A program that a test starts carries this hook too, and notes under the same test file.
  const hook = `--import=${new URL(import.meta.url).href}`
  if (!(process.env.NODE_OPTIONS ?? '').includes(hook))
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} ${hook}`.trim()

  // Each word of the environment that is read stands as the run handed it, which `scripts/tests.mjs` wrote: a word
  // that a test set or changed for what it starts is the test's own, whose code its key holds already. A copy of the
  // whole environment, as a program hands it to one it starts, reads no word: it reads each one's entry first.
  const fold = (word: string): string => (process.platform === 'win32' ? word.toUpperCase() : word)
  const handedAt = join(tree, 'results', 'handed.json')
  const handed = new Map<string, string>(
    existsSync(handedAt)
      ? Object.entries(JSON.parse(readFileSync(handedAt, 'utf8'))).map(([word, value]) => [fold(word), String(value)])
      : [],
  )
  const words = new Set<string>()
  const read = (target: NodeJS.ProcessEnv, word: string | symbol): void => {
    if (typeof word !== 'string' || words.has(fold(word))) return
    const now: unknown = Reflect.get(target, word)
    const was = handed.get(fold(word))
    if ((now === undefined && was === undefined) || now === was) {
      words.add(fold(word))
      // A word is kept by the fingerprint of its value: the record holds no value, which may be a secret.
      tell({ word: fold(word), value: was === undefined ? null : print(was) })
    }
  }
  // The word whose entry was last read: a copy reads a word's entry and then the word itself, at once.
  let described: string | symbol | undefined
  process.env = new Proxy(process.env, {
    get(target, word, receiver) {
      if (word === described) described = undefined
      else read(target, word)
      return Reflect.get(target, word, receiver)
    },
    // A word is set on the environment itself, which takes a value alone.
    set: (target, word, value) => Reflect.set(target, word, value),
    has(target, word) {
      read(target, word)
      return Reflect.has(target, word)
    },
    getOwnPropertyDescriptor(target, word) {
      described = word
      return Reflect.getOwnPropertyDescriptor(target, word)
    },
  })

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

  // A thread of the program loads this hook first, as a program it starts does: its code then runs as it would.
  const rig = fileURLToPath(import.meta.url)
  const Started = workerThreads.Worker
  const addressOf = (file: string | URL): string =>
    file instanceof URL
      ? file.href
      : file.startsWith('file:') || file.startsWith('data:')
        ? file
        : pathToFileURL(resolve(file)).href
  // A thread that is ended where it stands runs no end of its own: it tells what it noted when it is asked to, first,
  // and is given a second.
  const channel = `tent-touched-${process.pid}`
  if (threadId !== 0) {
    const asked = new workerThreads.BroadcastChannel(channel)
    asked.unref()
    asked.onmessage = (message) => {
      if (Reflect.get(Object(message.data), 'flush') !== threadId) return
      flush()
      asked.postMessage({ flushed: threadId })
    }
  }
  /** Asks a thread to tell what it noted, and answers once it did, or a second later. */
  const told = (thread: number): Promise<void> => {
    const asking = new workerThreads.BroadcastChannel(channel)
    return new Promise<void>((done) => {
      const timer = setTimeout(done, 1000)
      asking.onmessage = (message) => {
        if (Reflect.get(Object(message.data), 'flushed') !== thread) return
        clearTimeout(timer)
        done()
      }
      asking.postMessage({ flush: thread })
    }).finally(() => asking.close())
  }
  class Noted extends Started {
    #ended = false
    constructor(file: string | URL, options: workerThreads.WorkerOptions = {}) {
      super(
        options.eval
          ? `require(${JSON.stringify(rig)});\n${String(file)}`
          : `require(${JSON.stringify(rig)});\nimport(${JSON.stringify(addressOf(file))})`,
        { ...options, eval: true },
      )
      // A thread that ended by itself told what it noted as it ended.
      this.once('exit', () => {
        this.#ended = true
      })
    }
    override async terminate(): Promise<number> {
      if (!this.#ended) await told(this.threadId)
      return super.terminate()
    }
  }
  Reflect.set(workerThreads, 'Worker', Noted)
  syncBuiltinESMExports()
}
