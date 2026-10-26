import { pathToFileURL } from 'node:url'
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

/**
 * Has each word of the environment that the code of a test or of its app reads, in the work of a test under
 * `tent test`, noted under that test with its value as the program or the thread began. The word is found as the
 * system finds it, by its letters alone on Windows. A copy of the whole environment, as a program hands it to one it
 * starts, reads no word: it reads each one's entry first. The words that `tent test` sets itself are none of a test's.
 */
export function noteWordsRead(): void {
  const project = `${pathToFileURL(process.cwd()).href}/`
  const here = import.meta.url
  const fold = (word: string): string => (process.platform === 'win32' ? word.toUpperCase() : word)
  const began = new Map(Object.entries(process.env).map(([word, value]) => [fold(word), value ?? null]))
  const ours = new Set(['NODE_TEST_CONTEXT', 'TENT_TOUCHED', 'TENT_ROOM', 'TENT_DECLARED'].map(fold))
  // The word whose entry was last read: a copy reads a word's entry and then the word itself, at once.
  let described: string | symbol | undefined
  /** Whether the code that read a word is the test's or the app's own, past the ways of this file. */
  const byApp = (): boolean => {
    const held: { stack?: unknown } = {}
    const before = Error.prepareStackTrace
    Error.prepareStackTrace = (_, sites) => sites
    Error.captureStackTrace(held, byApp)
    // The stack is made when it is first read: it is read while the sites are what it is made of.
    const stack = held.stack
    Error.prepareStackTrace = before
    const site = (Array.isArray(stack) ? stack.filter(isSite) : []).find((one) => one.getFileName() !== here)
    const file = site?.getFileName()
    return typeof file === 'string' && isAppModule(file.startsWith('file:') ? file : pathToFileURL(file).href, project)
  }
  const read = (word: string | symbol): void => {
    if (typeof word === 'string' && !ours.has(fold(word)) && testUnderWay() !== undefined && byApp())
      noteWord(word, began.get(fold(word)) ?? null)
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
