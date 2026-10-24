import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from 'node:test'
import type { Finding } from '../core/index.ts'
import { finding } from '../core/internal.ts'
import { unmarked, wroteBy } from './marked.ts'

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
 * Gathers what each test touched, as the programs of the tests noted it in a folder, into `touched.json` of the
 * engine's own folder of the project, which `tent impact` reads: each test, by its file and its name, with the
 * definitions it ran. A run of some of the tests alone keeps what the others touched before. The folder is removed.
 */
function keepTouched(noted: string, data: string, some: boolean): void {
  const file = join(data, 'touched.json')
  const before: Record<string, string[]> =
    some && existsSync(file) ? Object(JSON.parse(readFileSync(file, 'utf8'))) : {}
  const all: Record<string, string[]> = {}
  for (const name of readdirSync(noted))
    for (const [test, names] of Object.entries(Object(JSON.parse(readFileSync(join(noted, name), 'utf8')))))
      all[test] = [...new Set([...(all[test] ?? []), ...(Array.isArray(names) ? names.map(String) : [])])].sort()
  rmSync(noted, { recursive: true, force: true })
  mkdirSync(data, { recursive: true })
  const sorted = Object.fromEntries(Object.entries({ ...before, ...all }).sort(([a], [b]) => (a < b ? -1 : 1)))
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`)
}

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

/** What a run of tests gave: how many passed, each failure as a finding, the tests not run, and each test as it ended. */
export interface Ran {
  passed: number
  findings: Finding[]
  notRun: { test: string; why: string }[]
  ended: { test: string; passed: boolean }[]
}

/**
 * Runs test files of a project by the test runner of the runtime, each as a program of its own in the folder of the
 * project, where `testApp()` gives it a fresh temporary copy of the app. `only` runs those tests alone, by their
 * names, and `but` every test but those. A test that failed is a finding that holds its whole failure: what it threw
 * and where, and what that test wrote out. Of a run that is not of AI behaviour, what each test touched is kept in
 * `.tent/touched.json`. `ended` is told each test as it ends, by its file and its name.
 */
export async function testsRan(
  folder: string,
  files: string[],
  o: { ai?: boolean; only?: string[]; but?: string[]; ended?(test: string, passed: boolean): void } = {},
): Promise<Ran> {
  const made: Ran = { passed: 0, findings: [], notRun: [], ended: [] }
  if (!files.length) return made
  // Each test program notes what its tests touched in a file of its own here, which is gathered when they end.
  const noted = o.ai ? undefined : mkdtempSync(join(tmpdir(), 'tent-touched-'))
  if (noted) process.env.TENT_TOUCHED = noted
  try {
    const names = new URL('./names.ts', import.meta.url).href
    const marks = new URL('./marks.ts', import.meta.url).href
    const events = run({
      files: files.map((file) => join(folder, file)),
      cwd: folder,
      execArgv: ['--import', names, '--import', marks],
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
      const file = (event.data.file ?? '').slice(folder.length + 1).replaceAll('\\', '/')
      const test = `${file}: ${event.data.name}`
      // A file whose every test was left out is told as one that passed: it is no test.
      if (event.type === 'test:pass' && event.data.name === event.data.file) continue
      if (event.type === 'test:pass') {
        made.passed++
        made.ended.push({ test, passed: true })
        o.ended?.(test, true)
        continue
      }
      // A test in an engine of a browser that is not driven on this computer is not run, and is never passed.
      const why = notRunWhy(event.data.details.error)
      if (why !== undefined) {
        made.notRun.push({ test, why })
        continue
      }
      made.ended.push({ test, passed: false })
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
      made.findings.push(
        finding('T0009', `The test "${event.data.name}" failed: ${whole}`, {
          fix: 'Mend the test or what it tests, and run `tent test` again: what a test writes with `console.log` is shown with its failure.',
          ...(event.data.file ? { where: { file, line: event.data.line ?? 1 } } : {}),
        }),
      )
    }
  } finally {
    if (noted) {
      delete process.env.TENT_TOUCHED
      keepTouched(noted, join(folder, '.tent'), o.only !== undefined || o.but !== undefined)
    }
  }
  return made
}
