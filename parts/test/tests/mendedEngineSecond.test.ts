import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { addOrder, addTeam, appIn, deskOf, fileOf, readFile, writeFile } from './desks.ts'
import { moment } from './many.ts'
import { copyOf } from './projects.ts'

// What the mending of a review of the whole holds, where the review gave a line and no test, and it takes a
// built project to show it.

const system = { as: { kind: 'system' } } as const

/** Writes a file of a copy of a project anew, with one text in the place of another, which it must hold. */
function replaced(file: string, from: string, to: string): void {
  const text = readFileSync(file, 'utf8')
  assert.ok(text.includes(from), `${file} holds ${JSON.stringify(from)}`)
  writeFileSync(file, text.replace(from, to))
}

test('[50-7] a row whose column work filled is moved into the file of its tenant with its rows of _t_filled, and the shared file keeps none of them', async (t) => {
  const folder = copyOf(t, 'moving')
  const tables = join(folder, 'tables.ts')
  replaced(
    tables,
    "import { anyone, link, table, text } from 'tentjs'",
    "import { action, anyone, link, table, text } from 'tentjs'",
  )
  replaced(
    tables,
    "const open = anyone('a test reads and writes it')\n",
    `const open = anyone('a test reads and writes it')

// The work that fills the loud body of a note.
export const shout = action('shout', {
  access: 'nobody',
  system: 'fills the loud body of a note from its body',
  input: { body: text() },
  output: text(),
  run: async ({ input }) => input.body.toUpperCase(),
})
`,
  )
  replaced(tables, '    body: text(),\n', '    body: text(),\n    loud: text({ optional: true, by: shout }),\n')
  const { app, dataFolder } = await appIn(t, folder)
  const team = String(Object(await app.call('addTeam', { name: 'the team' }, system)).id)
  const added = await app.write([{ add: 'notes', values: { team, body: 'a quiet note' } }], system)
  const note = String(Reflect.get(Object(Array.isArray(added) ? added[0] : added), 'id'))
  const filledIn = (file: string): unknown[] =>
    readFile(file, `SELECT "rowId" FROM "_t_filled" WHERE "tableName" = 'notes'`).map((one) => one.rowId)
  for (let i = 0; i < 300 && !filledIn(join(dataFolder, 'data.db')).includes(note); i++) {
    app.clock.advance('1 second')
    await new Promise((done) => setTimeout(done, 20))
  }
  assert.deepEqual(filledIn(join(dataFolder, 'data.db')), [note], 'the work filled the column')
  // The version in which the notes are a tenant table, by their team.
  replaced(tables, '  // where the notes live\n', "  tenant: 'team',\n")
  const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', 'bundle-tenant') })
  const moved = await app.switch(await app.add(built.bundleFolder), { move: true })
  assert.equal(moved.refused, undefined)
  assert.deepEqual(filledIn(join(dataFolder, 'data.db')), [], 'the shared file keeps the row of a note that left it')
  assert.deepEqual(filledIn(join(dataFolder, 'tenants', 'teams', team.slice(-2), `${team}.db`)), [note])
})

test('[20-7] the pass of a removal that a stop left under way is gone on with by the engine that opens: a file nobody opens is swept', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  const caller = await app.user({ name: 'Ada', roles: [] })
  const ada = caller.kind === 'user' ? (caller.user?.id ?? '') : ''
  await addOrder(app, north, 'placed by Ada', { placedBy: ada })
  await addOrder(app, north, 'placed by nobody')
  // The file is closed when the person is removed: it is not swept in that write.
  app.clock.advance('2 minutes')
  await moment()
  await app.call('removeUser', { user: ada }, system)
  // The engine is stopped while the shared file notes the pass of the removal.
  await app.kill()
  writeFile(join(dataFolder, 'data.db'), `INSERT INTO "_t_meta" ("key", "value") VALUES ('sweep', 'true')`)
  await app.restart()
  const titles = (): unknown[] =>
    readFile(fileOf(dataFolder, north), 'SELECT "title" FROM "orders" ORDER BY "title"').map((row) => row.title)
  for (let i = 0; i < 400 && titles().length > 1; i++) await moment(10)
  assert.deepEqual(titles(), ['placed by nobody'], 'the file nobody opened still holds the row of the removed person')
  const noted = (): unknown[] =>
    readFile(join(dataFolder, 'data.db'), `SELECT "key" FROM "_t_meta" WHERE "key" = 'sweep'`)
  for (let i = 0; i < 400 && noted().length; i++) await moment(10)
  assert.deepEqual(noted(), [], 'the note of the pass stands after it ended')
})
