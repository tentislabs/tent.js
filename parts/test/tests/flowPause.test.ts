import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { beat, level, machinesOf, until } from './many.ts'
import { notDropped } from './started.ts'

const system = { as: 'system' } as const

// A flow that waits an hour between its two steps, each of which adds a customer, one run at a time.
const flows = `import { flow, text } from 'tentjs'
import { addCustomer } from '../functions/functions'

export const tick = flow('tick', {
  input: { name: text() },
  together: { max: 1 },
  run: async ({ input, step }) => {
    await step('before', () => addCustomer({ name: \`before \${input.name}\` }))
    await step.wait('1 hour')
    await step('after', () => addCustomer({ name: \`after \${input.name}\` }))
  },
})
`

/** The names of the customers that a machine holds, in the order they were added. */
const customers = async (app: TestApp): Promise<string[]> =>
  (await app.rows('customers')).map((row) => String(row.name))

test('[46-2] a paused flow keeps its starts and its due runs on two machines: a reader that takes over holds the pause, and its `resume` lets them go in their order', async (t) => {
  const { app, near, far } = await machinesOf(t, (folder) => {
    mkdirSync(join(folder, 'flows'), { recursive: true })
    writeFileSync(join(folder, 'flows', 'flows.ts'), flows)
  })
  const waited = notDropped(await app.start('tick', { name: 't1' }, system)).run
  await until('the first run waits', () => app.runs.read(waited)?.state === 'waiting')
  app.runs.pause('tick')
  const kept = [
    notDropped(await app.start('tick', { name: 't2' }, system)).run,
    notDropped(await app.start('tick', { name: 't3' }, system)).run,
  ]
  app.clock.advance('1 hour')
  await beat(app, 2)
  assert.deepEqual(
    [waited, ...kept].map((run) => app.runs.read(run)?.state),
    ['waiting', 'queued', 'queued'],
  )
  await level(app, near, far)
  assert.deepEqual(near.runs.paused(), ['tick'], 'a reader reads the pause from its data')

  await app.kill()
  await beat(near, 6)
  await near.takeOver()
  assert.equal(near.role, 'writer')
  near.clock.advance('1 hour')
  await beat(near, 2)
  assert.deepEqual(near.runs.paused(), ['tick'], 'the new writer holds the pause')
  assert.deepEqual(
    [waited, ...kept].map((run) => near.runs.read(run)?.state),
    ['waiting', 'queued', 'queued'],
    'nothing goes on while the flow is paused',
  )
  assert.deepEqual(await customers(near), ['before t1'])

  near.runs.resume('tick')
  await until('the first run ends', () => near.runs.read(waited)?.state === 'done')
  await until('the kept runs work', () => kept.every((run) => near.runs.read(run)?.state === 'waiting'))
  assert.deepEqual(await customers(near), ['before t1', 'after t1', 'before t2', 'before t3'])
})
