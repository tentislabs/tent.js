import assert from 'node:assert/strict'
import { test } from 'node:test'
import { system } from './apps.ts'
import { flowing, marksOf, settle, untilWithin } from './flowing.ts'

/** The ids of the rows that a write answers, in their order. */
const idsOf = (rows: unknown): string[] =>
  Array.isArray(rows) ? rows.map((row: unknown) => String(Object(row).id)) : []

test('[21-19@10f] a row that `app.write` adds sets off the table triggers that the same row added by a change would, in that write', async (t) => {
  const { app } = await flowing(t)
  const [id] = idsOf(await app.write([{ add: 'customers', values: { name: 'Ada', tier: 'gold' } }], { as: system }))
  const rows = await app.write(
    [
      { add: 'orders', values: { customer: id, total: 5, status: 'open' } },
      { add: 'orders', values: { customer: id, total: 6, status: 'closed' } },
    ],
    { as: system },
  )
  const [open, closed] = idsOf(rows)
  await untilWithin(async () => (await marksOf(app)).length === 3, 'a run for each row that fits a trigger')
  await settle()
  assert.deepEqual((await marksOf(app)).sort(), [`gold ${closed}`, `gold ${open}`, `order ${open}`].sort())
  assert.deepEqual(
    app.runs.find({ flow: 'onOpenOrder' }).map((run) => Object(run.event).row?.id),
    [open],
    'no run for a row that the `where` of the trigger does not fit',
  )

  // A write that is undone starts no run: the start is part of it.
  await assert.rejects(
    app.write(
      [
        { add: 'orders', values: { customer: id, total: 7, status: 'open' } },
        { add: 'orders', values: { customer: id, status: 'open' } },
      ],
      { as: system },
    ),
  )
  await settle()
  assert.equal(app.runs.find({ flow: 'onOpenOrder' }).length, 1)
  assert.equal(app.runs.find({ flow: 'onGoldOrder' }).length, 2)
})
