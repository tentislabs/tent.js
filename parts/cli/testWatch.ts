import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describeProject, watchProject } from '../build/index.ts'
import type { Description } from '../core/internal.ts'
import type { Ran } from './testsRan.ts'
import { testFiles, testsRan } from './testsRan.ts'

// The kinds of definition of a description, each a record of definitions by their names.
const kinds = [
  'tables',
  'functions',
  'flows',
  'screens',
  'components',
  'services',
  'models',
  'agents',
  'routes',
  'commands',
]

/** Each definition of a description as its stored text, by its name. */
function definitionsOf(description: Description): Map<string, string> {
  const held = new Map<string, string>()
  for (const kind of kinds) {
    const all: Record<string, unknown> = Object(Reflect.get(description, kind))
    for (const [name, one] of Object.entries(all)) held.set(name, JSON.stringify(one))
  }
  return held
}

/** The names of the definitions that were added, changed or removed from one description to the next. */
function changedBetween(before: Map<string, string>, after: Map<string, string>): string[] {
  const names = new Set([...before.keys(), ...after.keys()])
  return [...names].filter((name) => before.get(name) !== after.get(name)).sort()
}

/** The tests that touched one of these definitions in their last run, by their files and names, as `touched.json` keeps them. */
function touching(folder: string, changed: string[]): string[] {
  const file = join(folder, '.tent', 'touched.json')
  if (!existsSync(file)) return []
  const touched: Record<string, unknown> = Object(JSON.parse(readFileSync(file, 'utf8')))
  return Object.entries(touched)
    .filter(([, names]) => Array.isArray(names) && names.some((one) => changed.includes(String(one))))
    .map(([test]) => test)
    .sort()
}

/** The line that ends a round: how many tests ran, passed and failed. */
const roundLine = (ran: Ran[]): string => {
  const ended = ran.flatMap((one) => one.ended)
  const passed = ended.filter((one) => one.passed).length
  return `ran ${ended.length} tests: ${passed} passed, ${ended.length - passed} failed`
}

/**
 * `tent test --watch`: runs every test of the project, and then on each save runs first the tests that touched the
 * definitions the save changed, as `.tent/touched.json` names them, and then the rest. What it prints is told to
 * `out`, a line at a time: each test as it ends, `passed <file>: <name>` or `failed <file>: <name>`, and a line that
 * ends each round. It runs until `stopped` comes, and saves are taken one round at a time, in their order.
 */
export async function watchTests(
  folder: string,
  o: { out(line: string): void; stopped: Promise<void> },
): Promise<void> {
  const told = (test: string, passed: boolean): void => o.out(`${passed ? 'passed' : 'failed'} ${test}`)
  const described = async (): Promise<Map<string, string>> => definitionsOf((await describeProject(folder)).description)
  let held = await described()
  // The first round runs every test. The folder is watched from before it, so that a save during it is taken next.
  let round: Promise<void> = (async () => {
    o.out(roundLine([await testsRan(folder, testFiles(folder, false), { ended: told })]))
  })()
  let due: NodeJS.Timeout | undefined
  const again = async (): Promise<void> => {
    const now = await described().catch(() => held)
    const changed = changedBetween(held, now)
    held = now
    if (!changed.length) return
    const first = touching(folder, changed)
    const files = testFiles(folder, false)
    const ran: Ran[] = []
    if (first.length) {
      o.out(`first, the tests that touched ${changed.join(', ')}:`)
      const firstFiles = [...new Set(first.map((test) => test.split(': ')[0]))].filter((file) => files.includes(file))
      const names = first.map((test) => test.slice(test.indexOf(': ') + 2))
      ran.push(await testsRan(folder, firstFiles, { only: names, ended: told }))
      o.out('then the rest:')
      ran.push(await testsRan(folder, files, { but: names, ended: told }))
    } else ran.push(await testsRan(folder, files, { ended: told }))
    o.out(roundLine(ran))
  }
  const watcher = await watchProject(folder, (file) => {
    const path = relative(folder, file).replaceAll('\\', '/')
    // A save of a test, of what a run writes or of the engine's own folder changes no definition.
    if (/^(tests|results|\.tent|node_modules)\//.test(path) || path === 'tent.d.ts') return
    clearTimeout(due)
    due = setTimeout(() => {
      round = round.then(again).catch((error: unknown) => o.out(`the round failed: ${String(error)}`))
    }, 100)
  })
  try {
    await o.stopped
  } finally {
    clearTimeout(due)
    await watcher.close()
    await round
  }
}
