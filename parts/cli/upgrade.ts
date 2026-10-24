import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../core/index.ts'
import { coreVersion } from '../core/internal.ts'
import { lineOf, openHistory } from '../history/index.ts'
import { commandPoint } from './commandPoint.ts'

/** The steps of an upgrade from one line of the framework to the next, as a file of `parts/cli/upgrades/` gives them. */
export interface Upgrade {
  from: string
  to: string
  steps: { name: string; run(o: { folder: string }): Promise<void> }[]
}

/** What an upgrade did: the lines it went from and to, the steps it ran, the changes as compare prints them, and what the check found. */
export interface Upgraded {
  from: string
  to: string
  steps: string[]
  changes: string[]
  findings: Finding[]
  said?: string
}

/** The two numbers of a line, read so that `1.10` is newer than `1.9`. */
const numbersOf = (line: string): number[] => line.split('.').map(Number)
const newerThan = (one: string, other: string): boolean => {
  const [a, b] = [numbersOf(one), numbersOf(other)]
  return a[0] !== b[0] ? a[0] > b[0] : (a[1] ?? 0) > (b[1] ?? 0)
}

/** The line of the framework that a project names in `engines.tentjs` of its package file, or that of this one. */
function lineOfProject(folder: string): string {
  const file = join(folder, 'package.json')
  if (!existsSync(file)) return coreVersion
  const named: unknown = Reflect.get(
    Object(Reflect.get(Object(JSON.parse(readFileSync(file, 'utf8'))), 'engines')),
    'tentjs',
  )
  return typeof named === 'string' && /^\d+\.\d+$/.test(named) ? named : coreVersion
}

/** Writes the line a project now stands on into its package file. */
function writeLine(folder: string, line: string): void {
  const file = join(folder, 'package.json')
  if (!existsSync(file)) return
  const about = Object(JSON.parse(readFileSync(file, 'utf8')))
  writeFileSync(file, `${JSON.stringify({ ...about, engines: { ...Object(about.engines), tentjs: line } }, null, 2)}\n`)
}

/**
 * Takes the folder of a project and the upgrades there are. Rewrites the project from the line it names to this
 * one: records a point, runs each step of each upgrade on the way over its files, records a point after them, runs
 * the check, and answers the change between the two points in the terms of compare, with what the check found.
 * With no step for this version it says so, and changes nothing.
 */
export async function upgradeProject(folder: string, upgrades: Upgrade[]): Promise<Upgraded> {
  const from = lineOfProject(folder)
  const way: Upgrade[] = []
  for (let at = from; ; ) {
    const next = upgrades.find((one) => one.from === at && !newerThan(one.to, coreVersion))
    if (!next) break
    way.push(next)
    at = next.to
  }
  if (!way.length)
    return {
      from,
      to: from,
      steps: [],
      changes: [],
      findings: [],
      said: `There is no step to upgrade a project of ${from} to ${coreVersion}: nothing was changed.`,
    }
  await commandPoint(folder)
  const history = openHistory(join(folder, '.tent'))
  const before = history.list({ kinds: ['command'], newest: 1 })[0]?.id
  history.close()
  const steps: string[] = []
  for (const upgrade of way)
    for (const step of upgrade.steps) {
      await step.run({ folder })
      steps.push(step.name)
    }
  const to = way[way.length - 1].to
  writeLine(folder, to)
  await commandPoint(folder)
  const { checkProject } = await import('../check/index.ts')
  const { findings } = await checkProject(folder)
  const after = openHistory(join(folder, '.tent'))
  const now = after.list({ kinds: ['command'], newest: 1 })[0]?.id
  const changes = before && now && before !== now ? after.compare(before, now).map((one) => lineOf(one)) : []
  after.close()
  return { from, to, steps, changes, findings }
}
