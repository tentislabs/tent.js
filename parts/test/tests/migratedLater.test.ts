import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { dataPlace, openOn } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

// A backfill over the tenant table, which counts its runs on each row.
const backfills = `import { backfill } from 'tentjs'
import { tasks } from '../tables/tables'

export const stampTasks = backfill('stampTasks', {
  table: tasks,
  run: (row, { db }) => {
    db.tasks.of(row.team).change(row.id, { runs: row.runs + 1 })
  },
})
`

async function bundleOf(t: TestContext, next: boolean): Promise<string> {
  const project = copyOf(t, 'migrated')
  if (next) {
    mkdirSync(join(project, 'backfills'))
    writeFileSync(join(project, 'backfills', 'backfills.ts'), backfills)
  }
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  return built.bundleFolder
}

const runsOf = async (app: { read(plan: object, as: object): Promise<unknown> }, team: string): Promise<unknown[]> => {
  const rows: unknown = await app.read({ from: 'tasks', of: team }, system)
  return (Array.isArray(rows) ? rows : []).map((one) => Reflect.get(Object(one), 'runs'))
}

test('[45-2] a backfill runs at the switch to its version alone: the file of a tenant made after it is not walked at a later opening', async (t) => {
  const [before, after] = [await bundleOf(t, false), await bundleOf(t, true)]
  const dataFolder = dataPlace(t)
  const first = await openOn(t, before, dataFolder)
  const old = String(Reflect.get(Object(await first.app.call('addTeam', { name: 'old' }, system)), 'id'))
  await first.app.call('addTask', { team: old, title: 'before' }, system)
  await first.engine.close()
  const next = await openOn(t, after, dataFolder)
  assert.deepEqual(await runsOf(next.app, old), [1])
  // A team made under the version that holds the backfill: its tasks were written by it, and need none.
  const late = String(Reflect.get(Object(await next.app.call('addTeam', { name: 'late' }, system)), 'id'))
  await next.app.call('addTask', { team: late, title: 'after' }, system)
  await next.engine.close()
  const again = await openOn(t, after, dataFolder)
  assert.deepEqual(await runsOf(again.app, old), [1])
  assert.deepEqual(await runsOf(again.app, late), [0], 'a row written by the version is not backfilled')
})
