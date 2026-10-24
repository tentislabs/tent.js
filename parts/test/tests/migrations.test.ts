import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { dataPlace, openOn, readFile } from './desks.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

// The backfills of the next version: one over a table of the shared file that fills a column which that version
// requires, and one over a tenant table. Each counts its runs on the row, so a row run twice says so.
const backfills = `import { backfill } from 'tentjs'
import { people, tasks } from '../tables/tables'

export const splitNames = backfill('splitNames', {
  table: people,
  fills: 'first',
  page: 7,
  run: (row, { db }) => {
    db.people.change(row.id, { first: row.fullName.split(' ')[0], runs: row.runs + 1 })
  },
})

export const stampTasks = backfill('stampTasks', {
  table: tasks,
  page: 5,
  run: (row, { db }) => {
    db.tasks.of(row.team).change(row.id, { runs: row.runs + 1 })
  },
})
`

/** A copy of the project of the backfills: as it is, or as its next version, which holds them. */
function backfilledProject(t: TestContext, next: boolean): string {
  const project = copyOf(t, 'migrated')
  if (!next) return project
  const tables = join(project, 'tables', 'tables.ts')
  writeFileSync(tables, readFileSync(tables, 'utf8').replace('first: text({ optional: true }),', 'first: text(),'))
  mkdirSync(join(project, 'backfills'))
  writeFileSync(join(project, 'backfills', 'backfills.ts'), backfills)
  return project
}

/** Builds a version of the project of the backfills, and answers the folder of its bundle. */
async function backfilledBundle(t: TestContext, next: boolean): Promise<string> {
  const project = backfilledProject(t, next)
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  return built.bundleFolder
}

/** Writes the rows the backfills walk: people of the shared file, and the tasks of three teams. */
async function someRows(app: App, people = 30): Promise<string[]> {
  for (let i = 0; i < people; i++) await app.call('addPerson', { fullName: `Person${i} Family${i}` }, system)
  const teams: string[] = []
  for (let k = 0; k < 3; k++) {
    teams.push(String(Reflect.get(Object(await app.call('addTeam', { name: `team ${k}` }, system)), 'id')))
    for (let i = 0; i < 12; i++) await app.call('addTask', { team: teams[k], title: `task ${i}` }, system)
  }
  return teams
}

/** Every row a table holds, as the system reads it, and of a tenant table the rows of each team. */
async function rowsOf(app: App, table: string, teams: string[] = []): Promise<Record<string, unknown>[]> {
  const read = async (plan: object): Promise<Record<string, unknown>[]> => {
    const rows: unknown = await app.read({ ...plan, sort: [{ by: 'id' }] }, system)
    return Array.isArray(rows) ? rows : []
  }
  if (!teams.length) return read({ from: table })
  const all: Record<string, unknown>[] = []
  for (const team of teams) all.push(...(await read({ from: table, of: team })))
  return all
}

test('[45-2] a backfill over a table of the shared file and one over a tenant table run once on every row of every file at the opening of the version that holds them, and the column the first fills is required in that version', async (t) => {
  const [before, after] = [await backfilledBundle(t, false), await backfilledBundle(t, true)]
  const dataFolder = dataPlace(t)
  const first = await openOn(t, before, dataFolder)
  const teams = await someRows(first.app)
  await first.engine.close()

  const next = await openOn(t, after, dataFolder)
  const people = await rowsOf(next.app, 'people')
  assert.equal(people.length, 30)
  for (const person of people) {
    assert.equal(person.runs, 1, `${String(person.fullName)} was backfilled once`)
    assert.equal(person.first, String(person.fullName).split(' ')[0])
  }
  const tasks = await rowsOf(next.app, 'tasks', teams)
  assert.equal(tasks.length, 36)
  for (const task of tasks) assert.equal(task.runs, 1, `${String(task.title)} was backfilled once`)
  // The column is required now: a row with none is refused.
  await assert.rejects(next.app.write([{ add: 'people', values: { fullName: 'No First' } }], system), {
    code: 'T2107',
  })
  // Opened again, the version runs neither backfill a second time: each is marked done in each file.
  await next.engine.close()
  const again = await openOn(t, after, dataFolder)
  for (const person of await rowsOf(again.app, 'people')) assert.equal(person.runs, 1)
  for (const task of await rowsOf(again.app, 'tasks', teams)) assert.equal(task.runs, 1)
})

test('[45-2] a backfill runs at the switch to its version, the rows it writes reach a reader as changes, and the reader runs none of it', async (t) => {
  const app = await testApp({ folder: backfilledProject(t, false) })
  closing(t, () => app.close())
  const teams = await someRows(app, 20)
  const reader = await app.reader()
  await app.switch(await app.add(await backfilledBundle(t, true)))
  for (const person of await rowsOf(app, 'people')) assert.equal(person.runs, 1)
  for (const task of await rowsOf(app, 'tasks', teams)) assert.equal(task.runs, 1)
  // The reader holds what the writer wrote, each row backfilled once.
  const settled = async (): Promise<boolean> => reader.at().n === app.at().n
  for (let tries = 0; tries < 200 && !(await settled()); tries++) await new Promise((done) => setTimeout(done, 25))
  // A reader answers a moment as text: the rows are held as JSON writes them.
  const same = (rows: unknown): unknown => JSON.parse(JSON.stringify(rows))
  assert.deepEqual(same(await rowsOf(reader, 'people')), same(await rowsOf(app, 'people')))
  assert.deepEqual(same(await rowsOf(reader, 'tasks', teams)), same(await rowsOf(app, 'tasks', teams)))
})

test('[45-2] a backfill that is killed at any moment goes on from its place, and every row is backfilled once', async (t) => {
  const [before, after] = [await backfilledBundle(t, false), await backfilledBundle(t, true)]
  const dataFolder = dataPlace(t)
  const first = await openOn(t, before, dataFolder)
  const teams = await someRows(first.app, 120)
  await first.engine.close()
  const program = join(import.meta.dirname, 'killed', 'migrate.ts')
  const args = [after, dataFolder, JSON.stringify(teams)]
  const killed = await runKilled(program, { times: 6, within: 2500, seed: 45, args })
  assert.equal(killed.kills, 6)
  const last = killed.ended.at(-1)
  assert.equal(last?.code, 0, String(last?.out))
  const told = JSON.parse(/^told: (.*)$/m.exec(last?.out ?? '')?.[1] ?? '{}')
  assert.equal(told.people, 120)
  assert.equal(told.tasks, 36)
  assert.deepEqual(told.runs, [1], 'every row was backfilled once')
})

test('[45-2] where a backfill stands is the note of the one walk of a switch, walk.<backfill>: the last row of the page it wrote, and done at its end', async (t) => {
  const before = await backfilledBundle(t, false)
  const dataFolder = dataPlace(t)
  const first = await openOn(t, before, dataFolder)
  await someRows(first.app)
  const people = (await rowsOf(first.app, 'people')).map((one) => String(one.id))
  await first.engine.close()
  // The backfill fails on the tenth person, in its second page of seven.
  const failing = backfilledProject(t, true)
  const file = join(failing, 'backfills', 'backfills.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      '  run: (row, { db }) => {\n    db.people',
      `  run: (row, { db }) => {\n    if (row.id === '${people[9]}') throw new Error('the tenth')\n    db.people`,
    ),
  )
  const built = await buildProject(failing, { for: 'dev', out: join(failing, 'bundle') })
  await assert.rejects(openOn(t, built.bundleFolder, dataFolder))
  const noteOf = (): unknown => {
    const [row] = readFile(join(dataFolder, 'data.db'), `SELECT "value" FROM "_t_meta" WHERE "key" = 'walk.splitNames'`)
    return row === undefined ? undefined : JSON.parse(String(row.value))
  }
  assert.deepEqual(noteOf(), { after: people[6] })
  const next = await openOn(t, await backfilledBundle(t, true), dataFolder)
  for (const person of await rowsOf(next.app, 'people')) assert.equal(person.runs, 1)
  await next.engine.close()
  assert.equal(noteOf(), 'done')
})
