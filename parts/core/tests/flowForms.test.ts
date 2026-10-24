import assert from 'node:assert/strict'
import { test } from 'node:test'
import { event, flow, project, text } from '../index.ts'
import { describe } from '../internal.ts'

const shop = project('shop', {})
// What the build reads of a `run` that holds our words alone: a body of no statement is the least of them.
const read = { run: [] }

/** The form of each flow of a description, by its name, with each flow's `run` read. */
function formsOf(flows: object[]): Record<string, unknown> {
  const { description } = describe({
    definitions: [{ value: shop }, ...flows.map((value) => ({ value, bodies: read }))],
  })
  return Object.fromEntries(Object.entries(description.flows).map(([name, record]) => [name, record.form]))
}

test('[46-1] [46-3] a flow whose `key`, a key of `stopOn` or `order` of `pace` is an arrow of code is described as code, though its `run` was read; one that states none of them is plain', () => {
  const run = async () => undefined
  assert.deepEqual(
    formsOf([
      flow('plainFlow', { input: { order: text() }, run }),
      flow('keyed', { input: { order: text() }, key: ({ input }) => input.order, run }),
      flow('stopped', { stopOn: event('order.cancelled', { key: ({ data }) => data }), run }),
      flow('ranked', { input: { rank: text() }, pace: { order: () => 1 }, run }),
      flow('paced', { pace: { debounce: '30 seconds' }, run }),
    ]),
    { plainFlow: 'plain', keyed: 'code', stopped: 'code', ranked: 'code', paced: 'plain' },
  )
})
