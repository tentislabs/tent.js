import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Prints } from '../build/index.ts'
import { projectPrints } from '../build/index.ts'
import type { Description, TestsTouched } from '../core/internal.ts'
import { fingerprintOf, isStored, touchedOf } from '../core/internal.ts'
import { fitsPattern, shippedRelease } from '../engine/index.ts'
import type { Ran } from './testsRan.ts'

/** One run of one test, as the record of the tests keeps it. */
interface KeptRun {
  result: 'passed' | 'failed'
  ms: number
  // What the result stands on: what it touched, as the project gave it when the test ran.
  key: string
  touched: Record<string, string[]>
  outside?: string[]
  // The test shares an app with the tests of its file, opened outside the work of any of them.
  whole?: true
}

/** The record of the tests of a project: each test by its file and its name, two tests of one name in their order. */
export interface Kept {
  tests: Record<string, Record<string, KeptRun[]>>
}

/** What the key of each test is made from beside what it touched: the project as it stands, and the room of the run. */
export interface Ground {
  prints: Prints & { description: Description }
  room: string
}

/** The files of a project, beside its test files, whose change any test may stand on. */
const groundFiles = ['tent.ts', 'seed.ts', 'engine.ts']

/**
 * Takes the folder of a project and the test files a run covers. Answers what the keys of their tests are made from:
 * the project as it stands now, described with no bundle written, and the room the tests run their code in.
 */
export async function groundOf(folder: string, files: string[]): Promise<Ground> {
  const room = process.env.TENT_ROOM === 'apart' ? 'apart' : 'program'
  return { prints: await projectPrints(folder, [...files, ...groundFiles]), room }
}

const fileOf = (folder: string): string => join(folder, '.tent', 'tests.json')

/** Sets the runs of one test of a record, by its file and its name. */
function setRuns(tests: Kept['tests'], file: string, name: string, runs: KeptRun[]): void {
  const names = tests[file] ?? {}
  names[name] = runs
  tests[file] = names
}

/** Whether a value is a run of a test as the record keeps it. */
function isRun(value: unknown): value is KeptRun {
  if (!isStored(value)) return false
  return (
    (value.result === 'passed' || value.result === 'failed') &&
    typeof value.ms === 'number' &&
    typeof value.key === 'string' &&
    isStored(value.touched)
  )
}

/** The record of the tests that `tent test` kept in the engine's own folder of the project, with no test where none is. */
export function keptTests(folder: string): Kept {
  const kept: Kept = { tests: {} }
  if (!existsSync(fileOf(folder))) return kept
  let read: unknown
  try {
    read = JSON.parse(readFileSync(fileOf(folder), 'utf8'))
  } catch {
    // A record that does not read is none: every test runs and makes it anew.
    return kept
  }
  const tests: unknown = isStored(read) ? read.tests : undefined
  for (const [file, names] of Object.entries(isStored(tests) ? tests : {}))
    for (const [name, runs] of Object.entries(isStored(names) ? names : {}))
      if (Array.isArray(runs) && runs.every(isRun)) setRuns(kept.tests, file, name, runs)
  return kept
}

/** What each test touched in its last run, as the record keeps it, or nothing where the tests of the project never ran. */
export const recordedTouched = (folder: string): TestsTouched | undefined =>
  existsSync(fileOf(folder)) ? touchedOf(keptTests(folder)) : undefined

// The kinds of a record that name definitions, whose fingerprints a key holds.
const definitionKinds = [
  'functions',
  'flows',
  'screens',
  'components',
  'routes',
  'commands',
  'incoming',
  'read',
  'wrote',
  'services',
  'models',
]

/** The definitions that react to what a test touched: they would run, or answer, where its work went. */
function reacting(description: Description, touched: Record<string, string[]>): string[] {
  const wrote = touched.wrote ?? []
  const events = touched.events ?? []
  const found: string[] = []
  // A flow that starts on a table the test wrote or an event it raised.
  for (const [name, flow] of Object.entries(description.flows))
    for (const trigger of Array.isArray(flow.on) ? flow.on : [])
      if (
        isStored(trigger) &&
        ((typeof trigger.table === 'string' && wrote.includes(trigger.table)) ||
          (typeof trigger.event === 'string' && events.includes(trigger.event)))
      )
        found.push(name)
  // The work that fills a column of a table the test wrote.
  for (const table of wrote) {
    const columns: unknown = Object.hasOwn(description.tables, table) ? description.tables[table].columns : undefined
    for (const column of Object.values(isStored(columns) ? columns : {})) {
      const by: unknown = isStored(column) ? column.by : undefined
      if (isStored(by) && typeof by.work === 'string') found.push(by.work)
      if (isStored(by) && isStored(column) && typeof column.model === 'string') found.push(column.model)
    }
  }
  // A screen and a route at an address the test asked, also one that answered nothing then.
  for (const asked of touched.asked ?? [])
    for (const part of [description.screens, description.routes])
      for (const [name, record] of Object.entries(part))
        if (typeof record.path === 'string' && fitsPattern(record.path, asked)) found.push(name)
  return found
}

/** The fingerprint of a file of the project, by its bytes, or of nothing where it is not there. */
function bytesPrint(folder: string, path: string): string {
  const lies = join(folder, path)
  return existsSync(lies) ? fingerprintOf(readFileSync(lies)) : 'none'
}

/**
 * Takes the folder of a project, what the keys of its tests are made from, a test file and what one of its tests
 * touched. Answers the key of that test: the fingerprint of each definition it touched and of each that reacts to it,
 * of its test file with what it reaches, of the files every test stands on, the messages and assets, the packages,
 * the framework, the runtime, the system and the room, the engines of the browsers it drove and the pictures it held.
 */
function keyOf(folder: string, ground: Ground, file: string, touched: Record<string, string[]>): string {
  const { prints } = ground
  const { description } = prints
  const named = [
    ...new Set([...definitionKinds.flatMap((kind) => touched[kind] ?? []), ...reacting(description, touched)]),
  ]
  const lines = [
    `framework ${shippedRelease()?.version ?? 'sources'}`,
    `runtime ${process.version}`,
    `system ${process.platform}-${process.arch}`,
    `room ${ground.room}`,
    `packages ${prints.lock}`,
    `test ${file} ${prints.files[file] ?? 'none'}`,
    ...groundFiles.map((path) => `file ${path} ${prints.files[path] ?? 'none'}`),
    `project ${JSON.stringify(description.project)}`,
    `messages ${JSON.stringify(description.messages)}`,
    `assets ${JSON.stringify(description.assets)}`,
    ...named.sort().map((name) => `definition ${name} ${prints.definitions[name] ?? 'none'}`),
    `browsers ${(touched.browsers ?? []).join(' ')}`,
    ...(touched.pictures ?? []).map((path) => `picture ${path} ${bytesPrint(folder, path)}`),
  ]
  return fingerprintOf(new TextEncoder().encode(lines.join('\n')))
}

/**
 * Takes the folder of a project, its record, what the keys are made from, and the test files a run covers. Answers
 * the tests of those files whose result is replayed, by their file, each with its names: a test that passed, reached
 * nothing outside, shares no app with its file, and whose key is what it was. A name of which one test is not
 * replayed is run whole.
 */
export function replaysOf(folder: string, kept: Kept, ground: Ground, files: string[]): Map<string, string[]> {
  const replays = new Map<string, string[]>()
  for (const file of files) {
    const names = Object.entries(kept.tests[file] ?? {})
      .filter(([, runs]) =>
        runs.every(
          (run) =>
            run.result === 'passed' &&
            !run.outside?.length &&
            run.whole !== true &&
            run.key === keyOf(folder, ground, file, run.touched),
        ),
      )
      .map(([name]) => name)
    if (names.length) replays.set(file, names)
  }
  return replays
}

/**
 * Takes the folder of a project and what a run of its tests stood on and gave: the record as it stood, what the keys
 * are made from, the run, the tests it replayed by their files, the files it ran whole and not for some names alone,
 * every test file of the project, and whether it ran everything. Writes the record anew: each test that ended, with
 * its result, its time, its key and what it touched; each replayed test as it stood; a test of a file run whole that
 * did neither is gone, and so is each test of a file that is no longer one. A run of everything keeps what it gave alone.
 */
export function keepRan(
  folder: string,
  o: {
    kept: Kept
    ground: Ground
    ran: Ran
    replays: Map<string, string[]>
    whole: string[]
    files: string[]
    all: boolean
  },
): void {
  const tests: Kept['tests'] = {}
  if (!o.all)
    for (const [file, names] of Object.entries(o.kept.tests)) {
      if (!o.files.includes(file)) continue
      const replayed = o.replays.get(file) ?? []
      for (const [name, runs] of Object.entries(names))
        if (!o.whole.includes(file) || replayed.includes(name)) setRuns(tests, file, name, runs)
    }
  const fresh = new Map<string, KeptRun[]>()
  for (const ended of o.ran.ended) {
    const noted = o.ran.noted.get(JSON.stringify([ended.file, ended.name, ended.nth]))
    const touched = Object.fromEntries(Object.entries(noted?.touched ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)))
    const run: KeptRun = {
      result: ended.passed ? 'passed' : 'failed',
      ms: Math.round(ended.ms),
      key: keyOf(folder, o.ground, ended.file, touched),
      touched,
      ...(noted?.outside.length ? { outside: noted.outside } : {}),
      ...(o.ran.whole.has(ended.file) ? { whole: true as const } : {}),
    }
    const at = `${ended.file}\n${ended.name}`
    const runs = fresh.get(at) ?? []
    runs[ended.nth] = run
    fresh.set(at, runs)
  }
  for (const [at, runs] of fresh) {
    const [file, name] = at.split('\n')
    setRuns(
      tests,
      file,
      name,
      runs.filter((one) => one !== undefined),
    )
  }
  const sorted = <Value>(record: Record<string, Value>): Record<string, Value> =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)))
  const written = sorted(Object.fromEntries(Object.entries(tests).map(([file, names]) => [file, sorted(names)])))
  mkdirSync(join(folder, '.tent'), { recursive: true })
  writeFileSync(fileOf(folder), `${JSON.stringify({ tests: written }, null, 2)}\n`)
}
