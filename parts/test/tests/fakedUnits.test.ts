import assert from 'node:assert/strict'
import { test } from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

test('[17-4] a fake of a model that is a function answers { output, units }, and its units are counted as a real call', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'fakedUnits') })
  closing(t, () => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  app.fake('writer', [{ text: 'Fine.' }])
  app.fake('gate', { call: () => ({ output: { score: 1, why: 'it may pass' }, units: { decisions: 2 } }) })
  const started = await app.start('desk', { message: 'Hello.' }, { as: maya })
  assert.ok('run' in started)
  // The output of the answer is what the guard was given: it let the message pass.
  assert.deepEqual(await app.runs.wait(started.run), { text: 'Fine.' })
  const rows: unknown = await app.read({ from: 'usage', where: { col: 'name', is: 'gate' } }, { as: 'system' })
  const decisions = (Array.isArray(rows) ? rows.map(Object) : [])
    .filter((row) => row.unit === 'decisions')
    .reduce((sum, row) => sum + Number(row.amount), 0)
  assert.equal(decisions, 2)
})
