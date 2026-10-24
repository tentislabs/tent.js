import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { bundled, engineOf, system, testClock, workFolder } from './apps.ts'

const moment = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** What the work of the project did, and the gate it waits at, made anew. */
function heldAnew(): { gate?: Promise<void>; calls: string[] } {
  const made: { gate?: Promise<void>; calls: string[] } = { calls: [] }
  Reflect.set(globalThis, Symbol.for('tentjs.test.engineFilling'), made)
  return made
}

/** Reads a data file that an engine may hold open. */
function rowsOf(dataFolder: string, sql: string): Record<string, unknown>[] {
  const db = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}

test('[51-12] a column that gains by on a table that holds rows is filled for each of them, also when the writer stopped in the middle of the walk', async (t) => {
  const work = workFolder(t)
  const dataFolder = join(work, 'data')
  const held = heldAnew()
  const { clock, advance } = testClock()
  const without = await bundled(
    t,
    {
      project: 'filling',
      change: (description: Description) => {
        Reflect.deleteProperty(Object(Reflect.get(Object(description.tables.orders?.columns), 'summary')), 'by')
      },
    },
    work,
  )
  const first = engineOf(t, { makers: { clock: () => clock } })
  const before = await first.open(without.folder, { dataFolder, mode: 'test' })
  for (let i = 0; i < 10; i++)
    await before.write([{ add: 'orders', values: { title: `order ${i}`, note: 'plain' } }], { as: system })
  await first.close()
  // The column gains `by`, with pages of four rows: the walk is held at its first value, and the writer stops there.
  const withBy = await bundled(
    t,
    {
      project: 'filling',
      change: (description: Description) => {
        description.project.limits = { ...Object(description.project.limits), workPage: 4 }
      },
    },
    work,
  )
  let open = (): void => undefined
  held.gate = new Promise<void>((done) => (open = done))
  const second = engineOf(t, { makers: { clock: () => clock } })
  await second.open(withBy.folder, { dataFolder, mode: 'test' })
  for (let i = 0; i < 200 && held.calls.length === 0; i++) await moment(10)
  const walked = rowsOf(dataFolder, `SELECT value FROM "_t_meta" WHERE "key" = 'walk.orders.summary'`)
  assert.ok(String(walked[0]?.value).includes('"after":"0'), `the walk stands in the middle: ${JSON.stringify(walked)}`)
  const stopping = second.close()
  delete held.gate
  open()
  await stopping
  const third = engineOf(t, { makers: { clock: () => clock } })
  const after = await third.open(withBy.folder, { dataFolder, mode: 'test' })
  for (let i = 0; i < 300; i++) {
    const rows = await after.read({ from: 'orders' }, { as: system })
    if (Array.isArray(rows) && rows.every((row) => typeof Reflect.get(Object(row), 'summary') === 'string')) break
    advance(1000)
    await moment()
  }
  const made = rowsOf(dataFolder, `SELECT "rowId" FROM "_t_filled" WHERE "columnName" = 'summary' AND "state" = 'made'`)
  assert.equal(made.length, 10, 'a value of each row was made')
  assert.deepEqual(
    rowsOf(dataFolder, `SELECT 1 FROM "_t_meta" WHERE "key" = 'walk.orders.summary'`),
    [],
    'the walk ended',
  )
})
