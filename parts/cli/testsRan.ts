import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { run } from 'node:test'
import type { Finding } from '../core/index.ts'
import { finding } from '../core/internal.ts'
import { unmarked, wroteBy } from './marked.ts'
import type { Failure } from './testFailed.ts'
import { failureOf, failureWords } from './testFailed.ts'

/** Every test file under a folder of a project, by its path from the project, written with `/`, in the order of the names. */
export function testFiles(project: string, ai: boolean, path = 'tests'): string[] {
  if (!existsSync(join(project, path))) return []
  return readdirSync(join(project, path), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const below = `${path}/${entry.name}`
      if (entry.isDirectory()) return testFiles(project, ai, below)
      // The tests of AI behaviour are files of their own: `--ai` runs them alone, and they are left out otherwise.
      const ofAi = /\.ai\.tsx?$/.test(entry.name)
      return /\.tsx?$/.test(entry.name) && ofAi === ai ? [below] : []
    })
}

/**
 * What the programs of the tests noted of one test: each kind of thing it touched, what reached outside, what stood
 * outside the held clock of its app, each word of the environment it read with its value, and each file of the
 * project its program loaded with its fingerprint as loaded.
 */
interface Noted {
  touched: Record<string, string[]>
  outside: string[]
  unheld: string[]
  env: Record<string, string | null>
  loaded: Record<string, string>
}

/** A record of texts, or of texts and nothing, as a program wrote it. */
const textsOf = (value: unknown): Record<string, string | null> =>
  Object.fromEntries(
    Object.entries(Object(value)).map(([key, one]) => [key, typeof one === 'string' ? one : null] as const),
  )

/** The texts of a list, and nothing of what is no text. */
const stringsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/**
 * Gathers what the programs of the tests and their threads noted in a folder, each in a file of its own, and removes
 * the folder. Answers what each test touched, by `[file, name, nth]` as text, every program's notes of one test
 * taken together, and the files of the tests whose app was opened outside the work of any test.
 */
function gathered(folder: string): { noted: Map<string, Noted>; whole: Set<string> } {
  const noted = new Map<string, Noted>()
  const whole = new Set<string>()
  for (const name of readdirSync(folder)) {
    const read: unknown = JSON.parse(readFileSync(join(folder, name), 'utf8'))
    const tests: Record<string, unknown> = Object(Reflect.get(Object(read), 'tests'))
    // The tests of a program stand on every file of the project it loaded.
    const loaded = Object.entries(textsOf(Reflect.get(Object(read), 'loaded'))).flatMap(([path, print]) =>
      print === null ? [] : [[path, print] as const],
    )
    for (const [test, one] of Object.entries(tests)) {
      const held = noted.get(test) ?? { touched: {}, outside: [], unheld: [], env: {}, loaded: {} }
      const touched: Record<string, unknown> = Object(Reflect.get(Object(one), 'touched'))
      for (const [kind, names] of Object.entries(touched))
        held.touched[kind] = [...new Set([...(held.touched[kind] ?? []), ...stringsOf(names)])].sort()
      held.outside = [...new Set([...held.outside, ...stringsOf(Reflect.get(Object(one), 'outside'))])].sort()
      held.unheld = [...new Set([...held.unheld, ...stringsOf(Reflect.get(Object(one), 'unheld'))])].sort()
      Object.assign(held.env, textsOf(Reflect.get(Object(one), 'env')))
      Object.assign(held.loaded, Object.fromEntries(loaded))
      noted.set(test, held)
      if (Reflect.get(Object(read), 'whole') === true) whole.add(String(JSON.parse(test)[0]))
    }
  }
  rmSync(folder, { recursive: true, force: true })
  return { noted, whole }
}

/** Two runs of tests as one. */
export const joinedRan = (one: Ran, other: Ran): Ran => ({
  passed: one.passed + other.passed,
  findings: [...one.findings, ...other.findings],
  notRun: [...one.notRun, ...other.notRun],
  ended: [...one.ended, ...other.ended],
  noted: new Map([...one.noted, ...other.noted]),
  whole: new Set([...one.whole, ...other.whole]),
  failures: [...one.failures, ...other.failures],
})

/** The lines of the stack of an error that lie in the project, each as its place from the folder of the project. */
function placesIn(stack: unknown, folder: string): string[] {
  const root = folder.replaceAll('\\', '/')
  return String(stack ?? '')
    .split('\n')
    .map((line) => line.replaceAll('\\', '/'))
    .filter((line) => line.includes(root) && !line.includes('/node_modules/'))
    .map((line) => line.slice(line.indexOf(root) + root.length + 1).replace(/\)$/, ''))
}

/**
 * Takes what the runner tells of a test that failed, the folder of the project, and what the test wrote out.
 * Answers the whole failure as text: what was thrown, with both values where two were held against each other,
 * where in the project it was thrown, and what the test wrote out before.
 */
function wholeFailure(error: unknown, folder: string, wrote: string): string {
  const cause: unknown = Reflect.get(Object(error), 'cause')
  const thrown = cause instanceof Error ? cause : error
  const message = String(Reflect.get(Object(thrown), 'message') ?? thrown)
  const name = String(Reflect.get(Object(thrown), 'name') ?? 'Error')
  const said = [name === 'AssertionError' || name === 'Error' ? message : `${name}: ${message}`]
  const places = placesIn(Reflect.get(Object(thrown), 'stack'), folder)
  if (places.length) said.push(`at ${places.slice(0, 5).join('\nat ')}`)
  if (wrote.trim()) said.push(`What the test wrote out:\n${wrote.trimEnd()}`)
  return said.join('\n')
}

/**
 * The words of a failure that says a test was not run, since the engine of its browser is not driven on this computer:
 * T0016, marked as not run. Nothing for any other failure.
 */
function notRunWhy(error: unknown): string | undefined {
  const cause: unknown = Reflect.get(Object(error), 'cause')
  const thrown = Object(cause ?? error)
  const marked = Reflect.get(Object(Reflect.get(thrown, 'fields')), 'engine') === 'notRun'
  return Reflect.get(thrown, 'code') === 'T0016' && marked ? String(Reflect.get(thrown, 'message')) : undefined
}

/** A pattern that fits the name of one test and no other. */
const exactly = (name: string): RegExp => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

/** One test as it ended: by its file, its name and how many of that name of the file ran before it, and its time. */
interface Ended {
  test: string
  file: string
  name: string
  nth: number
  passed: boolean
  ms: number
}

/**
 * What a run of tests gave: how many passed, each failure as a finding, the tests not run, each test as it ended,
 * what each test touched by `[file, name, nth]` as text, and the files whose tests share an app opened outside them.
 */
export interface Ran {
  passed: number
  findings: Finding[]
  notRun: { test: string; why: string }[]
  ended: Ended[]
  noted: Map<string, Noted>
  whole: Set<string>
  // The facts of each failure, as `--json` holds them.
  failures: Failure[]
}

/**
 * Runs test files of a project by the test runner of the runtime, each as a program of its own in the folder of the
 * project, where `testApp()` gives it a fresh temporary copy of the app. `only` runs those tests alone, by their
 * names, and `but` every test but those. A test that failed is a finding that holds its whole failure: what it threw
 * and where, and what that test wrote out. Of a run that is not of AI behaviour, what each test touched is noted
 * where its work was done, in its program and on its threads. `ended` is told each test as it ends, by its file and
 * its name.
 */
export async function testsRan(
  folder: string,
  files: string[],
  o: {
    ai?: boolean
    only?: string[]
    but?: string[]
    ended?(test: string, passed: boolean): void
    // The name the tests stand under, for a program of the framework's own that runs in the folder of the project:
    // what it touches is no test's of the project, and is not noted.
    as?: string
  } = {},
): Promise<Ran> {
  const made: Ran = {
    passed: 0,
    findings: [],
    notRun: [],
    ended: [],
    noted: new Map(),
    whole: new Set(),
    failures: [],
  }
  if (!files.length) return made
  // Each test program, and each of its threads, notes what its tests touched in a file of its own here, which is
  // gathered when they end.
  const noted = o.ai || o.as !== undefined ? undefined : mkdtempSync(join(tmpdir(), 'tent-touched-'))
  if (noted) process.env.TENT_TOUCHED = noted
  try {
    // The clock and the source of a test app are stood in first, before any module of the engine loads.
    const chance = new URL('./testChance.ts', import.meta.url).href
    const names = new URL('./names.ts', import.meta.url).href
    const noting = new URL('./testNoting.ts', import.meta.url).href
    const marks = new URL('./marks.ts', import.meta.url).href
    const events = run({
      files: files.map((file) => (isAbsolute(file) ? file : join(folder, file))),
      cwd: folder,
      // The cases made from the declarations note nothing, but hold what would reach outside by the same hook.
      execArgv: ['--import', chance, '--import', names, ...(o.ai ? [] : ['--import', noting]), '--import', marks],
      ...(o.ai ? { concurrency: 1 } : {}),
      ...(o.only ? { testNamePatterns: o.only.map(exactly) } : {}),
      ...(o.but?.length ? { testSkipPatterns: o.but.map(exactly) } : {}),
    })
    // Everything that each file wrote out, on each side: the runner tells of it before it tells how a test ended.
    const wrote = new Map<string, { out: string; err: string }>()
    // How many tests of one name of one file have ended, since two tests may carry one name.
    const ended = new Map<string, number>()
    for await (const event of events) {
      if (event.type === 'test:stdout' || event.type === 'test:stderr') {
        const held = wrote.get(event.data.file) ?? { out: '', err: '' }
        held[event.type === 'test:stdout' ? 'out' : 'err'] += event.data.message
        wrote.set(event.data.file, held)
        continue
      }
      if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
      // A group of tests is no test, and is counted by the tests it holds; one that was left out was not run.
      if (event.data.details.type === 'suite' || event.data.skip !== undefined) continue
      const key = `${event.data.file} ${event.data.name}`
      const nth = ended.get(key) ?? 0
      ended.set(key, nth + 1)
      const file = o.as ?? (event.data.file ?? '').slice(folder.length + 1).replaceAll('\\', '/')
      const test = `${file}: ${event.data.name}`
      const one = { test, file, name: event.data.name, nth, ms: event.data.details.duration_ms }
      // A file whose every test was left out is told as one that passed: it is no test.
      if (event.type === 'test:pass' && event.data.name === event.data.file) continue
      if (event.type === 'test:pass') {
        made.passed++
        made.ended.push({ ...one, passed: true })
        o.ended?.(test, true)
        continue
      }
      // A test in an engine of a browser that is not driven on this computer is not run, and is never passed.
      const why = notRunWhy(event.data.details.error)
      if (why !== undefined) {
        made.notRun.push({ test, why })
        continue
      }
      made.ended.push({ ...one, passed: false })
      o.ended?.(test, false)
      const held = event.data.file === undefined ? undefined : wrote.get(event.data.file)
      // A file that failed before a test of it began wrote what it wrote with no mark: all of it is shown.
      const isFile = event.data.name === event.data.file
      const written = !held
        ? ''
        : isFile
          ? unmarked(held.out) + unmarked(held.err)
          : wroteBy(held.out, event.data.name, nth) + wroteBy(held.err, event.data.name, nth)
      const whole = wholeFailure(event.data.details.error, folder, written)
      const error: unknown = event.data.details.error
      const thrown: unknown = Reflect.get(Object(error), 'cause') ?? error
      const places = placesIn(Reflect.get(Object(thrown), 'stack'), folder)
      const failure = failureOf(error, event.data.name, file, event.data.line ?? 1, places)
      made.failures.push(failure)
      made.findings.push(
        finding('T0009', `The test "${event.data.name}" failed: ${[whole, failureWords(failure)].join('\n')}`, {
          // The fix of the code that refused the test's last call, where it was refused, and else what mends a test.
          fix:
            failure.fix ??
            'Mend the test or what it tests, and run `tent test` again: what a test writes with `console.log` is shown with its failure.',
          ...(event.data.file ? { where: { file, line: failure.line } } : {}),
        }),
      )
    }
  } finally {
    if (noted) {
      delete process.env.TENT_TOUCHED
      const { noted: touched, whole } = gathered(noted)
      made.noted = touched
      made.whole = whole
    }
  }
  return made
}
