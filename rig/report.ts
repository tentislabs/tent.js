import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { TestEvent } from 'node:test/reporters'
import { type System, system } from './system.ts'

type State = 'passed' | 'failed' | 'owed'
type Measure = { value: number; unit: string; bar?: number }
type Picture = 'approved' | 'new'
type Result = {
  system: System
  commit: string
  tests: Record<string, State>
  measures: Record<string, Measure>
  pictures: Record<string, Picture>
}

// An id is a document and a test of it, with the letter of a half, the row of a list, or the step of a share.
const ID = /\[(\d\d-\d+(?:\.\d+)?[a-z]?(?:@\d+[a-z]?)?)\]/g
const worst: State[] = ['passed', 'owed', 'failed']

function commit(): string {
  // A run of a pull request checks out a commit that joins the branch to its target, so the run names the branch's own.
  if (process.env.TENT_COMMIT) return process.env.TENT_COMMIT
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

// A measure holds what its form names and no member more.
const isMeasure = (value: unknown): value is Measure =>
  typeof value === 'object' &&
  value !== null &&
  'value' in value &&
  typeof value.value === 'number' &&
  'unit' in value &&
  typeof value.unit === 'string' &&
  (!('bar' in value) || typeof value.bar === 'number') &&
  Object.keys(value).every((member) => ['value', 'unit', 'bar'].includes(member))

const isPicture = (value: unknown): value is Picture => value === 'approved' || value === 'new'

/**
 * Reads the small files that the rigs of a run wrote, each under the name its file carries after the kind. A file
 * that `held` does not pass, or that cannot be read, is left out and written into `wrong`.
 */
function gathered<T>(
  kind: string,
  name: (rest: string) => string,
  held: (value: unknown) => value is T,
  wrong: string[],
): Record<string, T> {
  const parts = join('results', 'parts')
  const found: Record<string, T> = {}
  if (!existsSync(parts)) return found
  for (const file of readdirSync(parts)) {
    if (!file.startsWith(`${kind}.`) || !file.endsWith('.json')) continue
    let value: unknown
    try {
      value = JSON.parse(readFileSync(join(parts, file), 'utf8'))
    } catch {
      value = undefined
    }
    if (held(value)) found[name(file.slice(kind.length + 1, -'.json'.length))] = value
    else wrong.push(`a file of results/parts/ of another form than its kind has: ${file}`)
  }
  return sorted(found)
}

/**
 * The reporter of the runs, which the test runner of the runtime loads. Takes the events of a run and answers the
 * lines it prints. It writes `results/<system>.json`, or `results/<system>.night.json` in a night run, under the
 * folder the run was started in, and beside it `results/failed.json`: each test that failed, by its file and its name,
 * and each reason the run fails that no test is. It fails the run for a test that states the mark and passes, for a test with no id
 * in its name, for a test or a group that was skipped, for a test that stands inside another test, and for a file of
 * `results/parts/` of another form than its kind has. Throws on a system that is none of the three.
 */
export default async function* report(source: AsyncIterable<TestEvent>): AsyncGenerator<string, void> {
  const tests: Record<string, State> = {}
  const wrong: string[] = []
  // What `scripts/tests.mjs` runs a second time: each test that failed, by its file and its name.
  const failing: { file: string; name: string }[] = []
  // The tests that ended one level deeper than a place of a file, and whose own holder has not ended yet.
  const below = new Map<string, string[]>()
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
    const { name, todo, details, nesting } = event.data
    const skipped = event.type === 'test:pass' && event.data.skip !== undefined
    if (event.type === 'test:fail' && event.data.file !== undefined && details.type !== 'suite')
      failing.push({ file: event.data.file, name })
    // The runner reports what stands inside a test or a group before it reports that test or group itself.
    const inside = below.get(`${event.data.file} ${nesting + 1}`) ?? []
    below.delete(`${event.data.file} ${nesting + 1}`)
    if (details.type !== 'suite') {
      for (const one of inside) wrong.push(`a test that stands inside another test: ${one}`)
      below.set(`${event.data.file} ${nesting}`, [...(below.get(`${event.data.file} ${nesting}`) ?? []), name])
    }
    // A group of tests is reported as its tests are, and carries no id of its own. The runner reports no test of a
    // group that was skipped, so the group itself is the one word of them.
    if (details.type === 'suite') {
      // Where the group itself stands inside a test, its tests stand inside that test too: they wait for it here.
      const beside = below.get(`${event.data.file} ${nesting}`) ?? []
      if (inside.length) below.set(`${event.data.file} ${nesting}`, [...beside, ...inside])
      if (skipped) wrong.push(`a group that was skipped: ${name}`)
      continue
    }
    // A file is reported under its own path when the run holds none of its tests, or when it cannot be loaded.
    // It is no test, and the runner itself fails the run for a file that cannot be loaded.
    if (event.data.file !== undefined && resolve(name) === event.data.file) continue
    const marked = todo !== undefined && todo !== false
    const met = marked && event.type === 'test:pass' && !skipped
    const failed = met || skipped || (!marked && event.type === 'test:fail')
    const state: State = failed ? 'failed' : marked ? 'owed' : 'passed'
    if (met) wrong.push(`a test that states the mark passes: ${name}`)
    if (skipped) wrong.push(`a test that was skipped: ${name}`)
    const ids = [...name.matchAll(ID)].map((match) => match[1])
    if (!ids.length) wrong.push(`a test with no id in its name: ${name}`)
    for (const id of ids) {
      const before = tests[id]
      if (before === undefined || worst.indexOf(state) > worst.indexOf(before)) tests[id] = state
    }
  }

  const result: Result = {
    system: system(),
    commit: commit(),
    tests: sorted(tests),
    measures: gathered('measure', (rest) => rest, isMeasure, wrong),
    // A picture's file is named `<engine>.<name>`, and its name may hold a dot of its own.
    pictures: gathered('picture', (rest) => rest.replace('.', '/'), isPicture, wrong),
  }
  const file = join('results', `${result.system}${process.env.TENT_RUN === 'night' ? '.night' : ''}.json`)
  mkdirSync('results', { recursive: true })
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(join('results', 'failed.json'), `${JSON.stringify({ failing, wrong }, null, 2)}\n`)

  const count = (state: State) => Object.values(result.tests).filter((one) => one === state).length
  yield `\n${file.replaceAll('\\', '/')}: ${count('passed')} passed, ${count('failed')} failed, ${count('owed')} owed\n`
  if (wrong.length) {
    process.exitCode = 1
    yield `The run fails:\n${wrong.map((line) => `  ${line}`).join('\n')}\n`
  }
}
