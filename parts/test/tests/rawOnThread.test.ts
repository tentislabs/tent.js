import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { addOrder, addTeam, appIn, fileOf, readFile } from './desks.ts'
import { codeOf } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

// Two heavy queries with full access that hand a raw text of one tenant to a query thread: one that reads, and
// one that would write.
const heavy = `
export const heavyCount = query('heavyCount', {
  access: open,
  system: 'a test counts the rows of one tenant by raw SQL, on a query thread',
  heavy: true,
  input: { team: text(), table: text() },
  output: number(),
  run: ({ db, input: given }) => db.sql('SELECT "id" FROM "' + given.table + '"', [], { of: given.team }).length,
})

export const heavyWrite = query('heavyWrite', {
  access: open,
  system: 'a test tries to write by raw SQL, on a query thread',
  heavy: true,
  input: { team: text() },
  output: number(),
  run: ({ db, input: given }) => db.sql('DELETE FROM "orders"', [], { of: given.team }).length,
})
`

test('[50-6] a heavy query that reads a file by raw SQL with of, where the file lacks a table of its layout, is answered once the main thread made the table: asked first on a thread, of the table that is there and of the one that was not, and a raw text that writes is still refused, and writes nothing', async (t) => {
  const project = copyOf(t, 'desk')
  const functions = join(project, 'functions', 'functions.ts')
  writeFileSync(functions, `${readFileSync(functions, 'utf8')}${heavy}`)
  const { app, dataFolder } = await appIn(t, project)
  const north = await addTeam(app, 'North')
  // The file of North holds `orders` and no `lines` yet, and nothing has asked it by raw SQL.
  await addOrder(app, north, 'of the north')
  const tables = (): string[] =>
    readFile(fileOf(dataFolder, north), `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table'`)
      .map((row) => String(row.name))
      .filter((name) => !name.startsWith('_t_') && !name.startsWith('sqlite_'))
      .sort()
  const counted = (table: string): Promise<unknown> => app.call('heavyCount', { team: north, table }, system)
  assert.equal(await counted('orders'), 1)
  assert.equal(await counted('lines'), 0)
  assert.equal(tables().includes('lines'), true, 'the table that the file lacked was made')
  // A raw text that writes is a write of a query: refused, on a thread as anywhere, and the row is there.
  assert.equal(await codeOf(app.call('heavyWrite', { team: north }, system)), 'T0012')
  assert.equal(await counted('orders'), 1)
})
