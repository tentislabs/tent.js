import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { running, send, system } from './apps.ts'
import { modeled } from './modeling.ts'
import { notDropped } from './started.ts'

test('[15-6] tent access lists every model of the project with its provider', async (t) => {
  const run = await modeled(t)
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(run.app, `${run.origin}/_t/admin/access`, {
    body: JSON.stringify({ args: {} }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  const access = Object(answered.body.value)
  const models: unknown = access.models
  assert.ok(Array.isArray(models), `the table holds no models: ${Object.keys(access).join(', ')}`)
  const writer = models.find((one: unknown) => Reflect.get(Object(one), 'name') === 'writer')
  assert.equal(Reflect.get(Object(writer), 'provider'), 'first')
})

// A project of one table and a flow whose step remembers an answer that rests on what it read of that table.
const tables = `import { list, project, table, text } from 'tentjs'

export const stepped = project('stepped', {})

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn', add: 'signedIn', remove: 'signedIn' },
})
`
const functions = `import { change, flow, input, number, text } from 'tentjs'
import { marks } from './tables.ts'

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

let made = 0

export const counting = flow('counting', {
  input: { n: number() },
  run: async ({ input: given, step, db }) =>
    step(
      'count',
      async () => {
        made += 1
        return (await db.marks.count()) * 1000 + made
      },
      { remember: { key: [given.n] } },
    ),
})
`

test('[51-6] the remembered answer of a step goes with what its work read: a mark that is added makes the step be carried out anew', async (t) => {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'stepped-'))
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  writeFileSync(join(folder, 'tables.ts'), tables)
  writeFileSync(join(folder, 'functions.ts'), functions)
  const { app } = await running(t, { project: relative(here, folder).replaceAll('\\', '/') })
  const first = await app.runs.wait(notDropped(await app.start('counting', { n: 1 }, { as: system })).run)
  const again = await app.runs.wait(notDropped(await app.start('counting', { n: 1 }, { as: system })).run)
  assert.equal(again, first, 'the step remembers its answer for the same key')
  await app.call('addMark', { what: 'one' }, { as: system })
  const after = await app.runs.wait(notDropped(await app.start('counting', { n: 1 }, { as: system })).run)
  assert.notEqual(after, first, 'the answer was given after the rows it was made from changed')
})
