import assert from 'node:assert/strict'
import { test } from 'node:test'
import { system } from './apps.ts'
import { flowing, marksOf, settle, untilWithin } from './flowing.ts'

test('[46-3] `pace` of a flow, with `debounce` on a table trigger whose flow writes no key: ten quick changes of an order make one run for it, after the last, with the last change', async (t) => {
  const { app, advance } = await flowing(t, { project: 'pacing' })
  const order = String(Object(await app.call('addOrder', { name: 'first' }, { as: system })).id)
  const other = String(Object(await app.call('addOrder', { name: 'other' }, { as: system })).id)
  for (let n = 1; n <= 10; n += 1) {
    await app.call('renameOrder', { order, name: `name ${n}` }, { as: system })
    advance(1000)
  }
  await app.call('renameOrder', { order: other, name: 'other renamed' }, { as: system })
  await settle()
  const runs = app.runs.find({ flow: 'noted' })
  assert.deepEqual(
    runs.map((run) => [run.key, run.state]).sort(),
    [
      [order, 'queued'],
      [other, 'queued'],
    ].sort(),
    'one start that waits for each order, keyed by its row',
  )
  advance(30_000)
  await untilWithin(async () => (await marksOf(app)).length === 2, 'both orders were noted')
  assert.deepEqual((await marksOf(app)).sort(), ['noted name 10', 'noted other renamed'])
  assert.equal(app.runs.find({ flow: 'noted' }).length, 2)
})
