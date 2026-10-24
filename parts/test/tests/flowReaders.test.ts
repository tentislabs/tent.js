import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { folderOf, level, machinesOf, send, until } from './many.ts'
import { notDropped } from './started.ts'

const system = { as: 'system' } as const

// The flows of these tests: a flow that waits an hour, an action that stops its runs from code, and a charge that
// keeps the card it computes in a sealed step.
const flows = `import { anyone, action, flow, list, number, object, runs, text } from 'tentjs'
import { addCustomer } from '../functions/functions'

export const tick = flow('tick', {
  input: { name: text() },
  run: async ({ input, step }) => {
    await step('before', () => input.name)
    await step.wait('1 hour')
  },
})

export const stopTicks = action('stopTicks', {
  access: anyone('a test of the machines calls it'),
  system: 'it stops the runs of a flow',
  output: object({ count: number(), runs: list(text()) }),
  run: async () => runs.stopAll({ flow: 'tick' }),
})

export const charge = flow('charge', {
  input: { name: text() },
  run: async ({ input, step }) => {
    const kept = await step('card', () => ({ card: \`card-of-\${input.name}-4242\` }), { sealed: true })
    await step.wait('1 hour')
    await step('use', () => addCustomer({ name: \`charged \${kept.card}\` }))
  },
})
`

const withFlows = (t: Parameters<typeof machinesOf>[0]) =>
  machinesOf(t, (folder) => {
    mkdirSync(join(folder, 'flows'), { recursive: true })
    writeFileSync(join(folder, 'flows', 'flows.ts'), flows)
  })

test("[46-2] on a reader, `app.runs.stopAll` and `runs.stopAll` of code are carried out by the writer, and answer the writer's count", async (t) => {
  const { app, near, far } = await withFlows(t)
  const ticks = [
    notDropped(await app.start('tick', { name: 'one' }, system)).run,
    notDropped(await app.start('tick', { name: 'two' }, system)).run,
  ]
  await until('both runs wait', () => ticks.every((run) => app.runs.read(String(run))?.state === 'waiting'))
  await level(app, near, far)
  const counted = await near.runs.stopAll({ flow: 'tick' }, { dry: true })
  assert.equal(counted.count, 2, 'the count of the writer, on a reader')
  assert.ok(
    ticks.every((run) => app.runs.read(String(run))?.state === 'waiting'),
    'a count stops nothing',
  )
  const stopped = await send(near, 'stopTicks')
  assert.equal(stopped.status, 200, JSON.stringify(stopped.error))
  assert.equal(Object(stopped.value).count, 2, 'code on a reader is answered the count of the writer')
  await until('the writer stopped both', () => ticks.every((run) => app.runs.read(String(run))?.state === 'stopped'))
})

test('[46-8] a sealed step result is the sealed text alone on a reader that holds no key: in what it reads of the run and in its data file', async (t) => {
  const { app, near, far } = await withFlows(t)
  // The writer holds the key of the secrets; the readers hold none.
  writeFileSync(join(folderOf(t, 'data'), 'secret.key'), `${randomBytes(32).toString('base64')}\n`)
  const run = String(notDropped(await app.start('charge', { name: 'ada' }, system)).run)
  await until('the charge waits', () => app.runs.read(run)?.state === 'waiting')
  await level(app, near, far)
  const shown = near.runs.read(run)?.steps.find((step) => step.name === 'card')?.result
  assert.ok(shown !== undefined, 'the reader holds the step')
  assert.doesNotMatch(JSON.stringify(shown), /4242/, 'the reader reads the sealed text alone')
  const data = new DatabaseSync(join(folderOf(t, 'reader-2'), 'data.db'), { readOnly: true })
  try {
    const row = data.prepare('SELECT result FROM "_t_steps" WHERE run = ? AND name = ?').get(run, 'card')
    assert.match(String(row?.result), /tent\.sealed/)
    assert.doesNotMatch(String(row?.result), /4242/, 'the data file of the reader holds the sealed text alone')
  } finally {
    data.close()
  }
  // The writer, which holds the key, reads it back opened.
  app.clock.advance('1 hour')
  await until('the charge ended', () => app.runs.read(run)?.state === 'done')
  assert.ok(
    (await app.rows('customers')).some((row) => row.name === 'charged card-of-ada-4242'),
    'the run read its result back opened',
  )
})
