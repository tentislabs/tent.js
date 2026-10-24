import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { publish } from '../index.ts'
import type { Server } from './server.ts'
import { computer, fetched, folderOf, started } from './server.ts'
import { notDropped } from './started.ts'

const flows = 'flows/approval.ts'

// The value that the flows of the project write inside their texts with values.
const order = ['$', '{input.order}'].join('')

/** A command of the admin channel of a server, as a command of its computer sends it. Answers its value. */
async function admin(server: Server, command: string, args: object): Promise<Record<string, unknown>> {
  const { token, port } = JSON.parse(readFileSync(join(server.data, 'engine.json'), 'utf8'))
  const answer = await server.app.request(
    new Request(`http://localhost:${port}/_t/admin/${command}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ args }),
    }),
  )
  const read = Object(await answer.json())
  assert.equal(read.ok, true, JSON.stringify(read))
  return Object(read.value)
}

test('[23-8] new code published while a run waits: the run finishes on its old code; runs move moves it where its steps still match, and refuses where one was renamed', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const { run: stays } = notDropped(await server.app.start('approval', { order: 'one' }, { as: 'system' }))
  const { run: moves } = notDropped(await server.app.start('approval', { order: 'two' }, { as: 'system' }))
  here.edit(
    flows,
    `return step('done', () => \`approved ${order}\`)`,
    `return step('done', () => \`approved anew ${order}\`)`,
  )
  await here.save()
  const next = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.equal(next.hard, false)
  server.app.runs.approve(stays, 'approved')
  assert.equal(await server.app.runs.wait(stays), 'approved one', 'the run finishes on the code it started with')
  const moved = await admin(server, 'runs', { what: 'move', id: moves })
  assert.equal(moved.moved, true)
  server.app.runs.approve(moves, 'approved')
  assert.equal(await server.app.runs.wait(moves), 'approved anew two', 'a moved run goes on with the new code')

  const { run: renamed } = notDropped(await server.app.start('approval', { order: 'three' }, { as: 'system' }))
  here.edit(flows, "await step('note', () => input.order)", "await step('noted', () => input.order)")
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const refused = await admin(server, 'runs', { what: 'move', id: renamed })
  assert.equal(refused.moved, false)
  assert.equal(refused.step, 'note')
})

test('[23-23@8c] at a publish, a waiting run of a flow that states moveRuns whenSafe is moved where its steps still match, and left where one does not', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const { run: matching } = notDropped(await server.app.start('moving', { order: 'one' }, { as: 'system' }))
  here.edit(
    flows,
    `return step('done', () => \`moved ${order}\`)`,
    `return step('done', () => \`moved anew ${order}\`)`,
  )
  // A hard publish, a column renamed, tries each run of a flow that is moved where it is safe.
  here.edit(
    'tables/orders.ts',
    '    title: text({ min: 1, max: 80 }),',
    "    name: text({ min: 1, max: 80, was: ['title'] }),",
  )
  here.edit('functions/orders.ts', "orders.add({ title: input('title')", "orders.add({ name: input('title')")
  await here.save()
  const next = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.equal(next.hard, true, 'the run that waits refuses nothing: it was moved')
  server.app.runs.approve(matching, 'approved')
  assert.equal(await server.app.runs.wait(matching), 'moved anew one')

  const { run: left } = notDropped(await server.app.start('moving', { order: 'two' }, { as: 'system' }))
  here.edit(
    flows,
    "moveRuns: 'whenSafe',\n  run: async ({ input, step }) => {\n    await step('note', () => input.order)",
    "moveRuns: 'whenSafe',\n  run: async ({ input, step }) => {\n    await step('noted', () => input.order)",
  )
  here.edit(
    'tables/orders.ts',
    "    name: text({ min: 1, max: 80, was: ['title'] }),",
    "    label: text({ min: 1, max: 80, was: ['name'] }),",
  )
  here.edit('functions/orders.ts', "orders.add({ name: input('title')", "orders.add({ label: input('title')")
  await here.save()
  const refused = await publish({ project: here.project, history: here.history, to, fetch: fetched }).then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )
  assert.deepEqual(
    [refused?.code, refused?.fields?.reason],
    ['T9103', 'waiting'],
    'a run whose step was renamed is left, and holds the hard publish',
  )
  assert.equal(server.app.runs.read(left)?.state, 'waiting')
})
