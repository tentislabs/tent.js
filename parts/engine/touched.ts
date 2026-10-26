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
  | 'heard'

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
// The test whose program this is as a whole, in a program that a test started: all its work is that test's.
let whole: TestNotes | undefined
const current = (): TestNotes | undefined => tests.getStore() ?? whole

// The notes of every test of this program, by the name of the test, which this program writes as one file.
const kept = new Map<string, TestNotes>()

// Whether a test app was opened outside the work of any test, by a hook of a file or its top: its tests share it.
let openedApart = false

// What a thread tells each new note to as it takes it, where its program handed it a way: the note is then the
// program's, whatever becomes of the thread.
let teller: ((line: string) => void) | undefined
const tell = (...note: (string | null)[]): void => teller?.(JSON.stringify(note))

/** Has each note taken from now on, but the facts of calls and the seed, told to `write` as a line of its own. */
export function tellNotesTo(write: (line: string) => void): void {
  teller = write
}

// Each file of the project that this program loaded as a module, with its fingerprint as it was loaded: the tests
// of the program stand on all of them.
const loaded = new Map<string, string>()

/** The notes of a test in this program, by its name, made at the first ask. */
export function notesOf(test: string): TestNotes {
  const held = kept.get(test)
  if (held) return held
  const made: TestNotes = { test, touched: new Map(), outside: new Set(), unheld: new Set(), env: new Map(), calls: [] }
  kept.set(test, made)
  tell('test', test)
  return made
}

/** Adds what of a test reached outside the program, told where it is new. */
function addOutside(notes: TestNotes, what: string): void {
  if (notes.outside.has(what)) return
  notes.outside.add(what)
  tell('outside', notes.test, what)
}

/** Has all the work of this program be the work of a test, by its name: a program that the test started is. */
export function noteAllAs(test: string): void {
  whole = notesOf(test)
}

/** Carries work out as the work of a test, whose notes take what it touches, and answers what the work answers. */
export const underTest = <Answer>(notes: TestNotes, work: () => Answer): Answer => tests.run(notes, work)

/** The name of the test whose work is under way, which crosses with a call to a thread, or nothing outside a test. */
export const testUnderWay = (): string | undefined => current()?.test

/** Notes that the test whose work is under way touched a thing of that kind. Outside a test it does nothing. */
export function noteTouched(kind: TouchedKind, name: string): void {
  const notes = current()
  if (!notes || name === '') return
  const names = notes.touched.get(kind) ?? new Set<string>()
  if (names.has(name)) return
  names.add(name)
  notes.touched.set(kind, names)
  tell('touched', notes.test, kind, name)
}

/** Notes that the work of the test under way reached outside the program, in a few words of what it reached. */
export function noteOutside(what: string): void {
  const notes = current()
  if (notes) addOutside(notes, what)
}

/**
 * Answers what notes that the test whose work is under way now reached outside, to be called where that work is no
 * longer under way, as when a browser asks: outside a test it does nothing.
 */
export function outsideNoter(): (what: string) => void {
  const notes = current()
  return (what) => {
    if (notes) addOutside(notes, what)
  }
}

/** Notes that the work of the test under way stood outside the held clock of its app, in a few words of what. */
export function noteUnheld(what: string): void {
  const notes = current()
  if (!notes || notes.unheld.has(what)) return
  notes.unheld.add(what)
  tell('unheld', notes.test, what)
}

/** Notes a word of the environment that the work of the test under way read, with its value as the program began. */
export function noteWord(word: string, value: string | null): void {
  const notes = current()
  if (!notes || notes.env.has(word)) return
  notes.env.set(word, value)
  tell('env', notes.test, word, value)
}

/** Notes a file of the project that this program loaded as a module, by its path and its fingerprint as loaded. */
export function noteLoaded(path: string, print: string): void {
  if (loaded.has(path)) return
  loaded.set(path, print)
  tell('loaded', path, print)
}

/** Keeps the facts of a call that the test under way made, as its newest: the last twenty are kept. */
export function noteCalled(facts: unknown): void {
  const notes = current()
  if (!notes) return
  notes.calls.push(facts)
  notes.calls.splice(0, Math.max(0, notes.calls.length - keptCalls))
}

/** Notes the random seed of a test app that the test under way opened: the first it opened is the one printed. */
export function noteSeed(seed: string): void {
  const notes = current()
  if (notes && notes.seed === undefined) notes.seed = seed
}

/** Notes that a test app was opened: outside the work of any test, its tests share its data. */
export function noteOpened(): void {
  if (current() || openedApart) return
  openedApart = true
  tell('whole')
}

/**
 * Takes a folder and a name. Writes the notes of every test of this program into `<name>.json` there: each test by
 * its name, with each kind it touched as a sorted list, what reached outside, what stood outside its held clock and
 * the words of the environment it read; whether a test app was opened outside the work of any test; and each file of
 * the project the program loaded, with its fingerprint. A thread writes a file of its own, so no two write one file.
 */
export function writeNotes(folder: string, name: string): void {
  written(folder, name, kept.values(), loaded, openedApart)
}

/** What is written of the notes of one test. */
interface Written {
  test: string
  touched: ReadonlyMap<string, ReadonlySet<string>>
  outside: ReadonlySet<string>
  unheld: ReadonlySet<string>
  env: ReadonlyMap<string, string | null>
}

/** Writes the notes of tests, the files of the project loaded, and whether an app was opened apart, as one file. */
function written(
  folder: string,
  name: string,
  all: Iterable<Written>,
  modules: ReadonlyMap<string, string>,
  apart: boolean,
): void {
  const tested: Record<
    string,
    { touched: Record<string, string[]>; outside: string[]; unheld: string[]; env: Record<string, string | null> }
  > = {}
  for (const notes of all)
    tested[notes.test] = {
      touched: Object.fromEntries([...notes.touched].map(([kind, names]) => [kind, [...names].sort()])),
      outside: [...notes.outside].sort(),
      unheld: [...notes.unheld].sort(),
      env: Object.fromEntries([...notes.env].sort(([a], [b]) => (a < b ? -1 : 1))),
    }
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, `${name}.json`),
    JSON.stringify({ tests: tested, loaded: Object.fromEntries(modules), ...(apart ? { whole: true } : {}) }),
  )
}

/**
 * Takes a folder, a name, and the lines that a thread told its notes by. Writes those notes into `<name>.json` there,
 * as `writeNotes` writes the notes of a program.
 */
export function writeToldNotes(folder: string, name: string, lines: string): void {
  const told = new Map<
    string,
    {
      test: string
      touched: Map<string, Set<string>>
      outside: Set<string>
      unheld: Set<string>
      env: Map<string, string | null>
    }
  >()
  const modules = new Map<string, string>()
  let apart = false
  const of = (test: string) => {
    const held = told.get(test) ?? { test, touched: new Map(), outside: new Set(), unheld: new Set(), env: new Map() }
    told.set(test, held)
    return held
  }
  for (const line of lines.split('\n')) {
    if (line === '') continue
    const note: unknown = JSON.parse(line)
    if (!Array.isArray(note)) continue
    const [kind, test, first, second] = note.map((one) => (typeof one === 'string' ? one : null))
    if (kind === 'whole') apart = true
    else if (kind === 'loaded' && test !== null && first !== null) modules.set(test, first)
    else if (test === null) continue
    else if (kind === 'test') of(test)
    else if (kind === 'outside' && first !== null) of(test).outside.add(first)
    else if (kind === 'unheld' && first !== null) of(test).unheld.add(first)
    else if (kind === 'env' && first !== null) of(test).env.set(first, second)
    else if (kind === 'touched' && first !== null && second !== null) {
      const touched = of(test).touched
      touched.set(first, (touched.get(first) ?? new Set()).add(second))
    }
  }
  written(folder, name, told.values(), modules, apart)
}
