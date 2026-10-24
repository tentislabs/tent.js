import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf, lineWith } from './copies.ts'

/** The findings of T7003 in a copy of a project of the rule, each as the line it stands at with its words. */
async function foundIn(folder: string, file: string): Promise<{ line: number; message: string; fix: string }[]> {
  const { findings } = await checkRules(folder)
  for (const one of findings) {
    assert.equal(one.code, 'T7003', one.message)
    assert.equal(one.where?.file, file, one.message)
  }
  return findings.map((one) => ({ line: one.where?.line ?? 0, message: one.message, fix: one.fix ?? '' }))
}

test('[26-6] [15-1@9a] T7003 for models: a limit that names no unit, a unit which nothing counts, units of a model over a service that name bytesOut, countBy app beside perCallerPerDay; with a provider of the builder own, a limit on its own unit is no finding', async () => {
  const file = 'models/writer.ts'
  assert.deepEqual(await foundIn(copyOf(join('T7003', 'models', 'pass'), 'T7003-models-pass'), file), [])
  const failing = copyOf(join('T7003', 'models', 'fail'), 'T7003-models-fail')
  const text = readFileSync(join(failing, file), 'utf8')
  const found = await foundIn(failing, file)
  const lines = found.map((one) => one.line)
  assert.deepEqual(lines, [
    lineWith(text, 'perDay: {}'),
    lineWith(text, 'export const unknown'),
    lineWith(text, 'export const engines'),
    lineWith(text, 'export const whole'),
  ])
  assert.match(found[0].message, /`limits.perDay` names no unit/)
  assert.match(found[1].message, /the unit `pictures`, which nothing in the project counts/)
  assert.match(found[2].message, /`units` names `bytesOut`/)
  assert.match(found[3].message, /perCallerPerDay/)
  for (const one of found) assert.ok(one.fix.length > 10)
  // With a model of a provider of the builder's own in the project, a unit's name says nothing.
  writeFileSync(
    join(failing, 'models', 'own.ts'),
    "import { model, object, text } from 'tentjs'\nexport const painter = model('painter', { provider: 'pictures', name: 'p-1', input: { prompt: text() }, output: object({ picture: text() }) })\n",
  )
  assert.ok(!(await foundIn(failing, file)).some((one) => one.message.includes('pictures')))
})

test('[15-1@9a] T7003 for agents: a perRun that names no unit, and one that names a unit which nothing counts; limits with no steps, and an agent with no limits at all, are no finding', async () => {
  const file = 'flows/helpers.ts'
  assert.deepEqual(await foundIn(copyOf(join('T7003', 'agents', 'pass'), 'T7003-agents-pass'), file), [])
  const failing = copyOf(join('T7003', 'agents', 'fail'), 'T7003-agents-fail')
  const text = readFileSync(join(failing, file), 'utf8')
  const found = await foundIn(failing, file)
  assert.deepEqual(
    found.map((one) => one.line),
    [lineWith(text, 'perRun: {}'), lineWith(text, 'export const unknownUnit')],
  )
  assert.match(found[0].message, /`limits.perRun` names no unit/)
  assert.match(found[1].message, /the unit `pictures`/)
})
