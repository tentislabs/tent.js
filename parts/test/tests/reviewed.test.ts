import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { describeProject } from '../../build/index.ts'
import { readFacts } from '../../engine/index.ts'
import { addOrder, addTeam, appIn, deskOf, fileOf, titlesOf } from './desks.ts'
import { moment } from './many.ts'
import { copyOf } from './projects.ts'

// The tests of the reviewer of the step: each holds a difference that the review found, and fails until it is mended.

const system = { as: { kind: 'system' } } as const

// Two queries with full access that count the rows of a table of one tenant by raw SQL: one where every other
// query is carried out, and one on a query thread.
const counting = `
export const rawCount = query('rawCount', {
  access: open,
  system: 'a test counts the rows of one tenant by raw SQL',
  input: { team: text(), table: text() },
  output: number(),
  run: ({ db, input: given }) => db.sql('SELECT "id" FROM "' + given.table + '"', [], { of: given.team }).length,
})

export const rawCountHeavy = query('rawCountHeavy', {
  access: open,
  system: 'a test counts the rows of one tenant by raw SQL, on a query thread',
  heavy: true,
  input: { team: text(), table: text() },
  output: number(),
  run: ({ db, input: given }) => db.sql('SELECT "id" FROM "' + given.table + '"', [], { of: given.team }).length,
})
`

test('[15-7] [50-6] the facts of the check hold a project against the file of each tenant: a row of one tenant that a table change does not fit is a finding of app.facts and of readFacts, with its tenant, as it refuses the opening', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'an order that holds no code')
  // The same project, in which `code` of `orders` must hold a value: the one order of North does not fit.
  const next = copyOf(t, 'desk')
  const tables = join(next, 'tables', 'tables.ts')
  writeFileSync(tables, readFileSync(tables, 'utf8').replace('code: text({ optional: true }),', 'code: text(),'))
  const { description } = await describeProject(next)
  const said = (facts: { tableFindings: { code: string; message: string }[] }): string[] =>
    facts.tableFindings.map((one) => `${one.code}${one.message.includes(north) ? ' with its tenant' : ''}`)
  assert.deepEqual(said(await app.facts(description)), ['T2001 with its tenant'], 'app.facts, of the running app')
  await app.kill()
  assert.deepEqual(
    said(await readFacts(dataFolder, description)),
    ['T2001 with its tenant'],
    'readFacts, with no engine',
  )
})

test('[50-6] raw SQL with of in a heavy query answers as it does where every other query is carried out: for a tenant with no file, and for a file that does not hold every table yet', async (t) => {
  const project = copyOf(t, 'desk')
  const functions = join(project, 'functions', 'functions.ts')
  writeFileSync(functions, `${readFileSync(functions, 'utf8')}${counting}`)
  const { app } = await appIn(t, project)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  // The file of North holds `orders` and no `lines` yet. South has no file.
  await addOrder(app, north, 'of the north')
  const counted = async (name: string, team: string): Promise<unknown> => {
    try {
      return await app.call(name, { team, table: 'orders' }, system)
    } catch (error) {
      return `${String(Reflect.get(Object(error), 'code'))}: ${String(Reflect.get(Object(error), 'message'))}`
    }
  }
  assert.deepEqual([await counted('rawCount', south), await counted('rawCount', north)], [0, 1])
  assert.equal(await counted('rawCountHeavy', south), 0, 'a tenant with no file, on a query thread')
  // Asked anew of a file that still lacks a table: the first asking of the query above made none on a thread.
  assert.equal(await counted('rawCountHeavy', north), 1, 'a file that lacks a table, on a query thread')
})

test('[50-12.7] a file laid by hand under the id of a tenant that names no tenant and no table it holds, and holds rows of another tenant: it is not opened, it is moved aside, and the tenant is one with no file, who writes again', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'of the north')
  app.clock.advance('2 minutes')
  await moment()
  // The file of North, with its tenant, its table and what it says of the table `orders` taken out, under South.
  const path = fileOf(dataFolder, south)
  mkdirSync(dirname(path), { recursive: true })
  cpSync(fileOf(dataFolder, north), path)
  const db = new DatabaseSync(path)
  db.exec(`DELETE FROM "_t_meta" WHERE "key" IN ('tenant', 'table', 'layout:orders')`)
  db.close()
  // No row of North is answered for South.
  assert.deepEqual(await app.rows('orders', { of: south }), [])
  // And the file is the file of nobody: it holds a row and names no tenant, so it is moved aside.
  assert.deepEqual([existsSync(path), existsSync(`${path}.refused`)], [false, true], 'the file is moved aside')
  await addOrder(app, south, 'of the south')
  assert.deepEqual(await titlesOf(app, south), ['of the south'])
  assert.deepEqual(await titlesOf(app, north), ['of the north'])
})
