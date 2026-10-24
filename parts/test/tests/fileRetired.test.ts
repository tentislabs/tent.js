import assert from 'node:assert/strict'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, listed, readFile } from './desks.ts'
import { moment, until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

// The one tenant table of the project whose tenants are its rooms, as its file of tables writes it.
const signs = /\/\/ A tenant table in every version[\s\S]*?\n}\)\n/

test('[50-5@6] the rows of a tenant table that is removed on purpose stay in the file of their tenant: the upkeep removes no file that holds them, and a version that holds the table again reads them', async (t) => {
  const folder = copyOf(t, 'moving')
  const built = async (out: string): Promise<string> => {
    const made = await buildProject(folder, { for: 'dev', out: join(folder, '..', out) })
    assert.deepEqual(
      made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
      [],
    )
    return made.bundleFolder
  }
  const withSigns = await built('bundle-1')
  const { app, dataFolder } = await appIn(t, folder)
  const first = String(running(app))
  await app.write([{ add: 'rooms', values: { name: 'the hall' } }], system)
  const room = String((await app.rows('rooms'))[0].id)
  await app.write([{ add: 'signs', of: room, values: { words: 'mind the step' } }], system)
  const file = join(dataFolder, 'tenants', 'rooms', room.slice(-2), `${room}.db`)
  await until('the file of the room stands', () => existsSync(file))

  // The next version removes the table on purpose: no tenant table names the rooms any more.
  const tables = join(folder, 'tables.ts')
  const text = readFileSync(tables, 'utf8')
  assert.match(text, signs)
  writeFileSync(tables, text.replace(signs, ''))
  const tent = join(folder, 'tent.ts')
  writeFileSync(
    tent,
    readFileSync(tent, 'utf8').replace("title: 'Notes that move',", "title: 'Notes that move',\n  removed: ['signs'],"),
  )
  const without = await app.add(await built('bundle-2'))
  const taken = await app.switch(without)
  assert.deepEqual([taken.refused, running(app)], [undefined, without])
  await until(
    'the pass has ended',
    async () => (await listed(app, dataFolder)).files.every((one) => !one.behind && !one.open),
    2000,
  )
  await moment(500)
  app.clock.advance('2 minutes')
  await moment(200)
  // The table is removed from the description and not dropped: the file still stands.
  assert.equal(existsSync(file), true)

  // A day passes, and the upkeep runs: the file holds a row that a later version reads again, so it stays.
  app.clock.advance('1 day')
  await moment(500)
  assert.equal(existsSync(file), true, 'the upkeep removed the file of a tenant that held the rows of a retired table')
  assert.equal(readFile(file, 'SELECT count(*) AS "n" FROM "signs"')[0]?.n, 1)

  // The version that holds the table is taken again: the row is there, with its words.
  assert.equal(await app.add(withSigns), first)
  await app.switch(first)
  assert.deepEqual(
    (await app.rows('signs')).map((row) => row.words),
    ['mind the step'],
  )
})

// A second tenant table whose tenants are the rooms.
const marks = `
export const marks = table('marks', {
  columns: { room: link('rooms', { onRemove: 'remove' }), sign: text() },
  tenant: 'room',
  access: { read: open, add: open },
})
`

test('[50-5@6] a file that holds the rows of a retired table alone is not removed by the upkeep: where two tenant tables are removed one after the other, the rows of the first are still read by a version that holds it again', async (t) => {
  const folder = copyOf(t, 'moving')
  const [tables, tent] = [join(folder, 'tables.ts'), join(folder, 'tent.ts')]
  appendFileSync(tables, marks)
  const [whole, project] = [readFileSync(tables, 'utf8'), readFileSync(tent, 'utf8')]
  const built = async (out: string): Promise<string> => {
    const made = await buildProject(folder, { for: 'dev', out: join(folder, '..', out) })
    assert.deepEqual(
      made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
      [],
    )
    return made.bundleFolder
  }
  const both = await built('bundle-1')
  const { app, dataFolder } = await appIn(t, folder)
  const first = String(running(app))
  await app.write([{ add: 'rooms', values: { name: 'the hall' } }], system)
  const room = String((await app.rows('rooms'))[0].id)
  // The room holds a sign, and no mark.
  await app.write([{ add: 'signs', of: room, values: { words: 'mind the step' } }], system)
  const file = join(dataFolder, 'tenants', 'rooms', room.slice(-2), `${room}.db`)
  const passed = async (): Promise<void> => {
    await until(
      'the pass has ended',
      async () => (await listed(app, dataFolder)).files.every((one) => !one.behind && !one.open),
      2000,
    )
    await moment(400)
    app.clock.advance('2 minutes')
    await moment(300)
  }
  const stated = (removed: string): string =>
    project.replace("title: 'Notes that move',", `title: 'Notes that move',\n  removed: [${removed}],`)

  // The signs are removed on purpose, and the marks stay a tenant table: the pass retires the signs in the file of the room.
  writeFileSync(tables, whole.replace(signs, ''))
  writeFileSync(tent, stated("'signs'"))
  await app.switch(await app.add(await built('bundle-2')))
  await passed()
  assert.equal(readFile(file, 'SELECT count(*) AS "n" FROM "signs"')[0]?.n, 1)
  // Then the marks are removed too: no tenant table names the rooms any more.
  writeFileSync(tables, whole.replace(signs, '').replace(marks, ''))
  writeFileSync(tent, stated("'signs', 'marks'"))
  await app.switch(await app.add(await built('bundle-3')))
  await passed()
  assert.equal(existsSync(file), true)

  // The upkeep runs. The file holds no row of a table that the app reads now, and the row of a retired one.
  app.clock.advance('1 day')
  await moment(600)
  assert.equal(existsSync(file), true, 'the upkeep removed a file that held the row of a retired table')
  // What is retired is dropped by `tent data clean` alone: the version that holds both tables reads the sign.
  writeFileSync(tables, whole)
  writeFileSync(tent, project)
  assert.equal(await app.add(both), first)
  await app.switch(first)
  assert.deepEqual(
    (await app.rows('signs')).map((row) => row.words),
    ['mind the step'],
  )
})
