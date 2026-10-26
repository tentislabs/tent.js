// Loaded into every test program of the framework's own runs by `scripts/tests.mjs`, and through `NODE_OPTIONS` into
// every program a test starts: notes each source file the program loads and each file and folder it reads under the
// tree that runs, and writes them, as the program ends, where `scripts/tests.mjs` keeps them for the next run.
import fs from 'node:fs'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { threadId } from 'node:worker_threads'

// The tree that runs, which `scripts/tests.mjs` names, and the test file whose program this is or started it.
const tree = process.env.TENT_TOUCHED_TREE
const of =
  process.env.TENT_TOUCHED_OF ??
  (tree && process.env.NODE_TEST_CONTEXT && process.argv[1]
    ? relative(tree, process.argv[1]).split(sep).join('/')
    : undefined)

/** The place of a path under the tree, written with `/`, or nothing for one outside it or of what a run makes. */
function placeOf(path: string): string | undefined {
  if (!tree) return undefined
  const place = relative(tree, resolve(path)).split(sep).join('/')
  if (place === '' || place.startsWith('..') || isAbsolute(place)) return undefined
  return /^(?:results|node_modules|\.git|\.tent)(?:\/|$)/.test(place) ? undefined : place
}

const noted = new Set<string>()
// Whether the program wrote what the rigs of a run gather, a measure or a picture, which a replay would not give.
let rigs = false

/** Notes a write into `results/parts/` of the tree, where the rigs of a run leave what they found. */
function noteWritten(given: unknown): void {
  const path = typeof given === 'string' ? given : given instanceof URL ? fileURLToPath(given) : undefined
  if (tree && path !== undefined && relative(join(tree, 'results', 'parts'), resolve(path)).split(sep)[0] !== '..')
    rigs = true
}

/** Notes a path that a file or a module names, as a text, a URL or bytes; a number names an open file, no path. */
function note(given: unknown): void {
  const path =
    typeof given === 'string'
      ? given.startsWith('file:')
        ? fileURLToPath(given)
        : // A module of the runtime, as `node:fs`, and any other address but a file's, is no path of the tree.
          /^[a-z][a-z0-9+.-]+:/i.test(given)
          ? undefined
          : given
      : given instanceof URL && given.protocol === 'file:'
        ? fileURLToPath(given)
        : Buffer.isBuffer(given)
          ? given.toString()
          : undefined
  const place = path === undefined ? undefined : placeOf(path)
  if (place !== undefined) noted.add(place)
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
  // Each way of the files that reads a file or a folder by its path notes the path first.
  const reading = (owner: object, names: string[]): void => {
    for (const name of names) {
      const own: unknown = Reflect.get(owner, name)
      if (typeof own !== 'function') continue
      const noting = function (this: unknown, ...given: unknown[]): unknown {
        note(given[0])
        return Reflect.apply(own, this, given)
      }
      // What a way carries beside itself, as `realpathSync.native`, it carries on.
      Reflect.set(owner, name, Object.assign(noting, own))
    }
  }
  const ways = ['readFile', 'readdir', 'stat', 'lstat', 'access', 'opendir', 'realpath']
  reading(fs, [...ways, ...ways.map((one) => `${one}Sync`), 'existsSync', 'createReadStream'])
  reading(fs.promises, ways)
  for (const name of ['writeFileSync', 'writeFile']) {
    const own: unknown = Reflect.get(fs, name)
    if (typeof own !== 'function') continue
    const noting = function (this: unknown, ...given: unknown[]): unknown {
      noteWritten(given[0])
      return Reflect.apply(own, this, given)
    }
    Reflect.set(fs, name, Object.assign(noting, own))
  }
  syncBuiltinESMExports()
  const written = fs.writeFileSync
  const made = fs.mkdirSync
  process.once('exit', () => {
    const folder = join(tree, 'results', 'touched')
    made(folder, { recursive: true })
    written(join(folder, `${process.pid}-${threadId}.json`), JSON.stringify({ of, files: [...noted].sort(), rigs }))
  })
}
