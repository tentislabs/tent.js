import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The kinds of what a test touches, each a list of names in its record. */
export type TouchedKind =
  | 'functions'
  | 'flows'
  | 'screens'
  | 'components'
  | 'routes'
  | 'commands'
  | 'incoming'
  | 'read'
  | 'wrote'
  | 'services'
  | 'models'
  | 'events'
  | 'asked'
  | 'browsers'
  | 'pictures'

/** What one test touched while it runs in this program, by the name the program of the tests gives it. */
export interface TestNotes {
  test: string
  touched: Map<TouchedKind, Set<string>>
  // What of it reached outside the program, in a few words each.
  outside: Set<string>
  // What of it stood outside the held clock of its app, in a few words each.
  unheld: Set<string>
  // Each word of the environment it read, with its value as the program began.
  env: Map<string, string | null>
  // The facts of the last calls it made, the newest last, which a failure of it tells.
  calls: unknown[]
  // The random seed of the test app it opened, which a failure of it prints.
  seed?: string
}

// How many calls of a test are kept with their facts: a long test stays light.
const keptCalls = 20

// The test whose work is under way: a note is made where the work is, never by what the program says runs now, so
// work that a test set off and that ends after it still lands under that test.
const tests = new AsyncLocalStorage<TestNotes>()

// The notes of every test of this program, by the name of the test, which this program writes as one file.
const kept = new Map<string, TestNotes>()

// Whether a test app was opened outside the work of any test, by a hook of a file or its top: its tests share it.
let openedApart = false

// Each file of the project that this program loaded as a module, with its fingerprint as it was loaded: the tests
// of the program stand on all of them.
const loaded = new Map<string, string>()

/** The notes of a test in this program, by its name, made at the first ask. */
export function notesOf(test: string): TestNotes {
  const held = kept.get(test)
  if (held) return held
  const made: TestNotes = { test, touched: new Map(), outside: new Set(), unheld: new Set(), env: new Map(), calls: [] }
  kept.set(test, made)
  return made
}

/** Carries work out as the work of a test, whose notes take what it touches, and answers what the work answers. */
export const underTest = <Answer>(notes: TestNotes, work: () => Answer): Answer => tests.run(notes, work)

/** The name of the test whose work is under way, which crosses with a call to a thread, or nothing outside a test. */
export const testUnderWay = (): string | undefined => tests.getStore()?.test

/** Notes that the test whose work is under way touched a thing of that kind. Outside a test it does nothing. */
export function noteTouched(kind: TouchedKind, name: string): void {
  const notes = tests.getStore()
  if (!notes || name === '') return
  const names = notes.touched.get(kind) ?? new Set<string>()
  names.add(name)
  notes.touched.set(kind, names)
}

/** Notes that the work of the test under way reached outside the program, in a few words of what it reached. */
export function noteOutside(what: string): void {
  tests.getStore()?.outside.add(what)
}

/**
 * Answers what notes that the test whose work is under way now reached outside, to be called where that work is no
 * longer under way, as when a browser asks: outside a test it does nothing.
 */
export function outsideNoter(): (what: string) => void {
  const notes = tests.getStore()
  return (what) => notes?.outside.add(what)
}

/** Notes that the work of the test under way stood outside the held clock of its app, in a few words of what. */
export function noteUnheld(what: string): void {
  tests.getStore()?.unheld.add(what)
}

/** Notes a word of the environment that the work of the test under way read, with its value as the program began. */
export function noteWord(word: string, value: string | null): void {
  const notes = tests.getStore()
  if (notes && !notes.env.has(word)) notes.env.set(word, value)
}

/** Notes a file of the project that this program loaded as a module, by its path and its fingerprint as loaded. */
export function noteLoaded(path: string, print: string): void {
  if (!loaded.has(path)) loaded.set(path, print)
}

/** Keeps the facts of a call that the test under way made, as its newest: the last twenty are kept. */
export function noteCalled(facts: unknown): void {
  const notes = tests.getStore()
  if (!notes) return
  notes.calls.push(facts)
  notes.calls.splice(0, Math.max(0, notes.calls.length - keptCalls))
}

/** Notes the random seed of a test app that the test under way opened: the first it opened is the one printed. */
export function noteSeed(seed: string): void {
  const notes = tests.getStore()
  if (notes && notes.seed === undefined) notes.seed = seed
}

/** Notes that a test app was opened: outside the work of any test, its tests share its data. */
export function noteOpened(): void {
  if (!tests.getStore()) openedApart = true
}

/**
 * Takes a folder and a name. Writes the notes of every test of this program into `<name>.json` there: each test by
 * its name, with each kind it touched as a sorted list, what reached outside, what stood outside its held clock and
 * the words of the environment it read; whether a test app was opened outside the work of any test; and each file of
 * the project the program loaded, with its fingerprint. A thread writes a file of its own, so no two write one file.
 */
export function writeNotes(folder: string, name: string): void {
  const tested: Record<
    string,
    { touched: Record<string, string[]>; outside: string[]; unheld: string[]; env: Record<string, string | null> }
  > = {}
  for (const notes of kept.values())
    tested[notes.test] = {
      touched: Object.fromEntries([...notes.touched].map(([kind, names]) => [kind, [...names].sort()])),
      outside: [...notes.outside].sort(),
      unheld: [...notes.unheld].sort(),
      env: Object.fromEntries([...notes.env].sort(([a], [b]) => (a < b ? -1 : 1))),
    }
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, `${name}.json`),
    JSON.stringify({ tests: tested, loaded: Object.fromEntries(loaded), ...(openedApart ? { whole: true } : {}) }),
  )
}
