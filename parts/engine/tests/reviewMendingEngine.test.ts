import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { bundled, engineOf, send, system, testClock, workFolder } from './apps.ts'
import { modeled, rowsIn } from './modeling.ts'
import { notDropped } from './started.ts'

const maya: Caller = { kind: 'user', user: { id: 'maya', roles: [] } }
const leo: Caller = { kind: 'user', user: { id: 'leo', roles: [] } }

test('[20-7] two removed people who used one model leave no row of the counts that names either of them, of the model and of the door and the data alike', async (t) => {
  const { app, dataFolder, origin } = await modeled(t)
  assert.equal(await app.call('backup.reply', ['Hi.'], { as: maya }), 'from the backup')
  assert.equal(await app.call('backup.reply', ['Hi.'], { as: leo }), 'from the backup')
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  for (const id of ['maya', 'leo']) {
    const answered = await send(app, `${origin}/_t/admin/data`, {
      body: JSON.stringify({ args: { what: 'user', do: 'remove', id, yes: true } }),
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(answered.status, 200, JSON.stringify(answered.body))
  }
  const named = rowsIn(dataFolder, 'data.db', 'SELECT name, caller, user FROM _t_counts').filter((row) =>
    [row.caller, row.user].some((one) => typeof one === 'string' && /maya|leo/.test(one)),
  )
  assert.deepEqual(named, [])
})

// A project whose only remembered answer is that of a step of a flow: no function states `remember`.
const tables = `import { list, project, table, text } from 'tentjs'

export const steppedOnly = project('steppedOnly', {})

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })
`
const functions = `import { flow, number } from 'tentjs'

export const counting = flow('counting', {
  input: { n: number() },
  run: async ({ input: given, step }) =>
    step('count', async () => given.n * 1000, { remember: { key: [given.n] } }),
})
`

test('[51-6] the daily upkeep takes away a remembered answer of a step that is past its time, also where no function states remember', async (t) => {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'stepped-only-'))
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  writeFileSync(join(folder, 'tables.ts'), tables)
  writeFileSync(join(folder, 'functions.ts'), functions)
  const work = workFolder(t)
  const bundle = await bundled(t, { project: relative(here, folder).replaceAll('\\', '/') }, work)
  const dataFolder = join(work, 'data')
  const { clock, advance } = testClock()
  const app = await engineOf(t, { makers: { clock: () => clock } }).open(bundle.folder, { dataFolder, mode: 'test' })
  assert.equal(await app.runs.wait(notDropped(await app.start('counting', { n: 1 }, { as: system })).run), 1000)
  const kept = (): number => rowsIn(dataFolder, 'data.db', 'SELECT key FROM _t_remembered').length
  assert.equal(kept(), 1, 'the step remembered its answer')
  // Thirty days and a day on: the answer is past its time, which is thirty days where it states none, and the
  // daily upkeep has run since.
  advance(31 * 86_400_000)
  await new Promise((done) => setTimeout(done, 50))
  assert.equal(kept(), 0, 'the remembered answer past its time is taken away')
})
