import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fingerprintOf } from '../core/internal.ts'
import { noteWord, testUnderWay } from './touched.ts'

/**
 * Takes the address of a module and the address of the folder of the project. Answers whether the module is the
 * app's own: a module of its code that the engine loaded, or a file of its project that is no package.
 */
export function isAppModule(url: string, project: string): boolean {
  if (!url.startsWith('file:')) return false
  if (new URL(url).searchParams.has('tent-app')) return true
  return url.startsWith(project) && !url.includes('/node_modules/')
}

const isSite = (one: unknown): one is NodeJS.CallSite => typeof Reflect.get(Object(one), 'getFileName') === 'function'

// The packages of the framework in the folder of a project, by the address of the project: `tentjs` and every
// package it names, which an install lays beside the app's own. Every other package is the app's.
const frameworks = new Map<string, string[]>()
function frameworkOf(project: string): string[] {
  const held = frameworks.get(project)
  if (held) return held
  let named: string[] = []
  try {
    const told: unknown = JSON.parse(
      readFileSync(fileURLToPath(new URL('node_modules/tentjs/package.json', project)), 'utf8'),
    )
    named = Object.keys(Object(Reflect.get(Object(told), 'dependencies')))
  } catch {
    // A project that holds no install of the framework, as one the framework's own tests run, holds none of its packages.
  }
  const made = ['tentjs', ...named].map((name) => `${project}node_modules/${name}/`)
  frameworks.set(project, made)
  return made
}

/**
 * Takes the address of a file whose code is under way and the address of the folder of the project. Answers whether
 * the code is the app's: a module of the app's own code, or any file of its project, the packages it imports among
 * them, but for the framework and the packages it brings.
 */
function isAppFrame(url: string, project: string): boolean {
  if (new URL(url).searchParams.has('tent-app')) return true
  return url.startsWith(project) && !frameworkOf(project).some((one) => url.startsWith(one))
}

/**
 * Takes a function that was called, the files whose frames are its own ways, and the address of the folder of the
 * project. Answers whether the code that called the function is the test's or the app's own: the first frame past
 * those files lies in the app's code or a package it imports.
 */
export function calledByApp(
  called: ((...given: never[]) => unknown) | (abstract new (...given: never[]) => unknown),
  own: string[],
  project: string,
): boolean {
  const held: { stack?: unknown } = {}
  const before = Error.prepareStackTrace
  Error.prepareStackTrace = (_, sites) => sites
  Error.captureStackTrace(held, called)
  // The stack is made when it is first read: it is read while the sites are what it is made of.
  const stack = held.stack
  Error.prepareStackTrace = before
  const site = (Array.isArray(stack) ? stack.filter(isSite) : []).find(
    (one) => !own.includes(String(one.getFileName())),
  )
  const file = site?.getFileName()
  // A module of the runtime, as `node:child_process`, is no file: a path of the disk alone is made an address.
  if (typeof file !== 'string' || (!file.startsWith('file:') && !isAbsolute(file))) return false
  return isAppFrame(file.startsWith('file:') ? file : pathToFileURL(file).href, project)
}

/**
 * Has each word of the environment that the code of a test or of its app reads, in the work of a test under
 * `tent test`, noted under that test with its value as the program or the thread began. The word is found as the
 * system finds it, by its letters alone on Windows. A copy of the whole environment that this code makes, as a spread
 * or a list of its words, reads every word. The words that `tent test` sets itself are none of a test's. A thread that
 * carries its notes elsewhere hands `under`, whether its code is a test's work now, and `sink`, which takes a word.
 */
export function noteWordsRead(
  o: { under?: () => boolean; sink?: (word: string, value: string | null) => void } = {},
): void {
  const under = o.under ?? (() => testUnderWay() !== undefined)
  const sink = o.sink ?? noteWord
  const project = `${pathToFileURL(process.cwd()).href}/`
  const here = import.meta.url
  const fold = (word: string): string => (process.platform === 'win32' ? word.toUpperCase() : word)
  const began = new Map(Object.entries(process.env).map(([word, value]) => [fold(word), value ?? null]))
  const ours = new Set(['NODE_TEST_CONTEXT', 'TENT_TOUCHED', 'TENT_ROOM', 'TENT_DECLARED'].map(fold))
  /** Whether the code that read a word is the test's or the app's own, past the ways of this file. */
  const byApp = (): boolean => calledByApp(byApp, [here], project)
  // A word is kept by the fingerprint of its value: the record of the tests holds no value, which may be a secret.
  const noted = (word: string): void => {
    const value = began.get(fold(word))
    if (!ours.has(fold(word))) sink(word, value === undefined || value === null ? null : fingerprintOf(value))
  }
  const read = (word: string | symbol): void => {
    if (typeof word === 'string' && under() && byApp()) noted(word)
  }
  process.env = new Proxy(process.env, {
    get(target, word, receiver) {
      read(word)
      return Reflect.get(target, word, receiver)
    },
    // A word is set on the environment itself, which takes a value alone.
    set: (target, word, value) => Reflect.set(target, word, value),
    has(target, word) {
      read(word)
      return Reflect.has(target, word)
    },
    ownKeys(target) {
      const words = Reflect.ownKeys(target)
      if (under() && byApp()) for (const word of words) if (typeof word === 'string') noted(word)
      return words
    },
  })
}
