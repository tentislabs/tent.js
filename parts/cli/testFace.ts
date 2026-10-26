import { relative, sep } from 'node:path'
import real from 'node:test'
import { fileURLToPath } from 'node:url'
import { compileFunction } from 'node:vm'
import type { TestNotes } from '../engine/index.ts'
import { notesOf, underTest, writeNotes } from '../engine/index.ts'

// What a test file of an app imports as `node:test` under `tent test`: the runner of the runtime, each of whose tests
// and their hooks runs as the work of its test, so that whatever the test touches is noted under it wherever it is done.

/** A function among the words of a test or a hook, and a word of the runner. */
type Body = (...given: unknown[]) => unknown
type Word = (...given: never[]) => unknown

const isBody = (one: unknown): one is Body => typeof one === 'function'

// The notes of each test by the context the runner hands it and its hooks, and how many tests of each name of the
// file began: two tests of one name are told apart by their order.
const noted = new WeakMap<object, TestNotes>()
const began = new Map<string, number>()

/** The notes of the test of a context that the runner hands, made when the test first runs. */
function ofTest(t: unknown): TestNotes {
  const context = Object(t)
  const held = noted.get(context)
  if (held) return held
  const path: unknown = Reflect.get(context, 'filePath')
  const file = relative(process.cwd(), typeof path === 'string' ? path : '')
    .split(sep)
    .join('/')
  const name = String(Reflect.get(context, 'name'))
  const nth = began.get(`${file}\n${name}`) ?? 0
  began.set(`${file}\n${name}`, nth + 1)
  const made = notesOf(JSON.stringify([file, name, nth]))
  noted.set(context, made)
  return made
}

/** A function of a test or of a hook of each test, carried out as the work of its test, with its count of parameters. */
function inTest(fn: Body): Body {
  const carried = function (this: unknown, ...given: unknown[]): unknown {
    const notes = ofTest(given[0])
    // A failure carries the last call the test made, where it carries none of its own, and the random seed of its
    // app, which `tent test` tells, so that a run with that seed fails the same way.
    const told = (error: unknown): never => {
      const last = notes.calls.at(-1)
      if (typeof error === 'object' && error !== null) {
        if (!Object.hasOwn(error, 'call') && last !== undefined) Object.assign(error, { call: last })
        if (notes.seed !== undefined) Object.assign(error, { randomSeed: notes.seed })
      }
      throw error
    }
    try {
      const answer: unknown = underTest(notes, () => Reflect.apply(fn, this, given))
      return answer instanceof Promise ? answer.catch(told) : answer
    } catch (error) {
      return told(error)
    }
  }
  // The runner hands a function that declares two parameters a callback that ends it.
  Object.defineProperty(carried, 'length', { value: fn.length })
  return carried
}

const isSite = (one: unknown): one is NodeJS.CallSite => typeof Reflect.get(Object(one), 'getLineNumber') === 'function'

/** Where the code that called a function stands: its file, its line and its column, as the runtime counts them. */
function placeOf(called: Body): { file: string; line: number; column: number } | undefined {
  const held: { stack?: unknown } = {}
  const before = Error.prepareStackTrace
  Error.prepareStackTrace = (_, sites) => sites
  Error.captureStackTrace(held, called)
  // The stack is made when it is first read: it is read while the sites are what it is made of.
  const stack = held.stack
  Error.prepareStackTrace = before
  const [site] = Array.isArray(stack) ? stack.filter(isSite) : []
  const file = site?.getFileName()
  if (!site || typeof file !== 'string') return undefined
  return {
    file: file.startsWith('file:') ? fileURLToPath(file) : file,
    line: site.getLineNumber() ?? 1,
    column: site.getColumnNumber() ?? 1,
  }
}

const called = 'return runner(...given)'

/**
 * A word of the runner whose functions are carried out as the work of their test. The runner places a test where
 * the code that called its word stands: so the word is called from a function that stands at that very place.
 */
function faced(word: Word): Body {
  const face: Body = (...given) => {
    const carried = given.map((one) => (isBody(one) ? inTest(one) : one))
    const at = placeOf(face)
    if (!at) return Reflect.apply(word, undefined, carried)
    const there = compileFunction(called, ['runner', 'given'], {
      filename: at.file,
      lineOffset: at.line - 1,
      columnOffset: at.column - 1 - called.indexOf('runner('),
    })
    return Reflect.apply(there, undefined, [word, carried])
  }
  return face
}

/** `test`, with the words the runner gives beside it. */
const testFaced = (word: Word & { skip: Word; todo: Word; only: Word }) =>
  Object.assign(faced(word), { skip: faced(word.skip), todo: faced(word.todo), only: faced(word.only) })

export const test = testFaced(real)
export const it = testFaced(real.it)
export const beforeEach = faced(real.beforeEach)
export const afterEach = faced(real.afterEach)
export const { skip, todo, only } = test
export const { before, after, describe, suite, mock, run, snapshot, assert } = real
export default Object.assign(test, {
  test,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  describe,
  suite,
  mock,
  run,
  snapshot,
  assert,
})

// What each test of this program touched is written, as the program ends, where `tent test` gathers it.
const folder = process.env.TENT_TOUCHED
if (folder) process.once('exit', () => writeNotes(folder, String(process.pid)))
