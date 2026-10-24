import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { dataPlace, openOn } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

// The next version requires `label` of a task, which its backfill fills from the title.
const backfills = `import { backfill } from 'tentjs'
import { tasks } from '../tables/tables'

export const labelTasks = backfill('labelTasks', {
  table: tasks,
  fills: 'label',
  run: (row, { db }) => {
    db.tasks.of(row.team).change(row.id, { label: row.title.toUpperCase(), runs: row.runs + 1 })
  },
})
`

/** A version of the project of the backfills whose tasks have a label: optional, or required with its backfill. */
async function bundleOf(t: TestContext, next: boolean): Promise<string> {
  const project = copyOf(t, 'migrated')
  const tables = join(project, 'tables', 'tables.ts')
  writeFileSync(
    tables,
    readFileSync(tables, 'utf8').replace(
      'title: text(), runs: number({ default: 0 }) },',
      `title: text(), label: text(${next ? '' : '{ optional: true }'}), runs: number({ default: 0 }) },`,
    ),
  )
  if (next) {
    mkdirSync(join(project, 'backfills'))
    writeFileSync(join(project, 'backfills', 'backfills.ts'), backfills)
  }
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => one.message),
    [],
  )
  return built.bundleFolder
}

/** Every file of a tenant under a data folder. */
function tenantFiles(folder: string): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    if (!existsSync(at)) return
    for (const entry of readdirSync(at, { withFileTypes: true }))
      if (entry.isDirectory()) walk(join(at, entry.name))
      else if (entry.name.endsWith('.db')) found.push(join(at, entry.name))
  }
  walk(join(folder, 'tenants'))
  return found
}

test('[45-2] a column that a backfill fills in a tenant table is made required in the file of each tenant once the backfill ran there, and the switch is taken', async (t) => {
  const [before, after] = [await bundleOf(t, false), await bundleOf(t, true)]
  const dataFolder = dataPlace(t)
  const first = await openOn(t, before, dataFolder)
  const teams: string[] = []
  for (const name of ['one', 'two']) {
    const team = String(Reflect.get(Object(await first.app.call('addTeam', { name }, system)), 'id'))
    teams.push(team)
    for (const title of ['a', 'b', 'c']) await first.app.call('addTask', { team, title }, system)
  }
  await first.engine.close()
  const next = await openOn(t, after, dataFolder)
  for (const team of teams) {
    const rows: unknown = await next.app.read({ from: 'tasks', of: team, sort: [{ by: 'title' }] }, system)
    assert.deepEqual(
      (Array.isArray(rows) ? rows : []).map((one) => [
        Reflect.get(Object(one), 'label'),
        Reflect.get(Object(one), 'runs'),
      ]),
      [
        ['A', 1],
        ['B', 1],
        ['C', 1],
      ],
    )
  }
  await next.engine.close()
  const files = tenantFiles(dataFolder)
  assert.equal(files.length, 2)
  for (const file of files) {
    const db = new DatabaseSync(file, { readOnly: true })
    const columns = db.prepare(`SELECT "name", "notnull" FROM pragma_table_info('tasks')`).all()
    db.close()
    assert.equal(columns.find((one) => one.name === 'label')?.notnull, 1, 'the label is required in the file')
  }
})
