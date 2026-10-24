import assert from 'node:assert/strict'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, command, listed, readFile } from './desks.ts'
import { moment, until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

// The tenant table of the project whose tenants are its rooms, as its file of tables writes it, and a second one beside it.
const signs = /\/\/ A tenant table in every version[\s\S]*?\n}\)\n/
const marks = `
export const marks = table('marks', {
  columns: { room: link('rooms', { onRemove: 'remove' }), sign: text() },
  tenant: 'room',
  access: { read: open, add: open },
})
`

/** Whether a data file holds a table of that name, read with no engine. */
const holds = (file: string, table: string): boolean =>
  readFile(file, `SELECT count(*) AS "n" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = '${table}'`)[0]?.n ===
  1

test('[50-5@6] tent data clean reaches each file of a tenant: a retired table is dropped in a file that is open and in one that is closed, each by a write of a higher number, and what the app still reads stays', async (t) => {
  const folder = copyOf(t, 'moving')
  const [tables, tent] = [join(folder, 'tables.ts'), join(folder, 'tent.ts')]
  appendFileSync(tables, marks)
  const built = async (out: string): Promise<string> => {
    const made = await buildProject(folder, { for: 'dev', out: join(folder, '..', out) })
    assert.deepEqual(
      made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
      [],
    )
    return made.bundleFolder
  }
  await built('bundle-1')
  const { app, dataFolder } = await appIn(t, folder)
  const rooms: string[] = []
  for (const name of ['the hall', 'the attic', 'the yard']) {
    await app.write([{ add: 'rooms', values: { name } }], system)
    const room = String((await app.rows('rooms')).find((row) => row.name === name)?.id)
    rooms.push(room)
    await app.write([{ add: 'signs', of: room, values: { words: `a sign of ${name}` } }], system)
    await app.write([{ add: 'marks', of: room, values: { sign: `a mark of ${name}` } }], system)
  }
  const fileOf = (room: string): string => join(dataFolder, 'tenants', 'rooms', room.slice(-2), `${room}.db`)
  const settled = async (): Promise<void> => {
    await until(
      'the pass has ended',
      async () => (await listed(app, dataFolder)).files.every((one) => !one.behind),
      2000,
    )
  }

  // The signs are removed on purpose: the pass retires them in each file, where their rows stay.
  writeFileSync(tables, readFileSync(tables, 'utf8').replace(signs, ''))
  writeFileSync(
    tent,
    readFileSync(tent, 'utf8').replace("title: 'Notes that move',", "title: 'Notes that move',\n  removed: ['signs'],"),
  )
  const without = await app.add(await built('bundle-2'))
  await app.switch(without)
  assert.equal(running(app), without)
  await settled()
  // Every file is closed, and then one of them is opened again by a write.
  await moment(300)
  app.clock.advance('2 minutes')
  await moment(300)
  await app.write([{ add: 'marks', of: rooms[0], values: { sign: 'a second mark of the hall' } }], system)
  for (const room of rooms)
    assert.equal(holds(fileOf(room), 'signs'), true, 'the retired table stands before the clean')
  const before = new Map((await listed(app, dataFolder)).files.map((one) => [one.id, one]))
  assert.deepEqual(
    rooms.map((room) => before.get(room)?.open),
    [true, false, false],
  )

  // The clean: what was retired is dropped in every file, the open one and the closed ones.
  await command(app, dataFolder, 'data', { what: 'clean' })
  await until(
    'no file holds the retired table any more',
    () => rooms.every((room) => !holds(fileOf(room), 'signs')),
    3000,
  )
  await settled()
  const after = new Map((await listed(app, dataFolder)).files.map((one) => [one.id, one]))
  for (const room of rooms) {
    assert.equal(existsSync(fileOf(room)), true)
    assert.equal(after.get(room)?.failed, undefined)
    assert.ok(
      Number(after.get(room)?.writes) > Number(before.get(room)?.writes),
      `the write that cleaned the file of ${room} took a higher number`,
    )
  }
  // What the app reads is as it was.
  assert.deepEqual((await app.rows('marks')).map((row) => String(row.sign)).sort(), [
    'a mark of the attic',
    'a mark of the hall',
    'a mark of the yard',
    'a second mark of the hall',
  ])
  // A second clean finds nothing that was retired, and leaves no file failed.
  await command(app, dataFolder, 'data', { what: 'clean' })
  await settled()
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => one.failed),
    rooms.map(() => undefined),
  )
})
