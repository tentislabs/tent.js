import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkProject } from '../index.ts'
import { checkRules } from '../ours.ts'
import { copyOf, lineWith } from './copies.ts'

const file = 'flows/orders.ts'

test('[16-2@10f] [46-5] one event name emitted with two shapes of data, where no declaration says which, is the warning T5111 at the emit of the second shape; one shape, and a declared event, give none', async () => {
  const passing = await checkRules(copyOf(join('T5111', 'pass'), 'T5111-pass'))
  assert.deepEqual(passing.findings, [], 'the passing project')
  const folder = copyOf(join('T5111', 'fail'), 'T5111-fail')
  const { findings } = await checkRules(folder)
  const text = readFileSync(join(folder, file), 'utf8')
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.file, one.where?.line]),
    [['T5111', 'warning', file, lineWith(text, 'carrier: input.carrier })')]],
  )
  const [found] = findings
  assert.match(found.message, /order\.shipped/)
  assert.ok(found.fix && found.fix.length > 10)
  assert.equal(found.docs, 'tent docs T5111')
})

test('[46-5] `emit` of a declared event with data that does not fit is a type error, by the declaration and by its name in the type list, and `on` and `waitFor` of it are handed its type', async () => {
  const folder = copyOf('eventTyped', 'eventTyped')
  const text = readFileSync(join(folder, file), 'utf8')
  const { findings } = await checkProject(folder)
  const typed = findings.filter((one) => one.code === 'T8000')
  for (const piece of [
    'emit(orderShipped, { order: 5',
    "emit('order.shipped', { order: input.order })",
    'const missing = event.data.nothere',
    'const missing = shipped.data?.nothere',
  ]) {
    const line = lineWith(text, piece)
    assert.ok(line > 0, piece)
    assert.equal(typed.filter((one) => one.where?.file === file && one.where.line === line).length, 1, piece)
  }
  // The emit that fits, the read of a field that the data has, and the declaration itself are found nowhere.
  assert.equal(typed.length, 4, JSON.stringify(typed.map((one) => [one.where?.line, one.message])))
  assert.deepEqual(
    findings.filter((one) => one.code === 'T1006'),
    [],
    'a declared event is no helper that a backend file exports',
  )
  const types = readFileSync(join(folder, 'tent.d.ts'), 'utf8')
  assert.match(
    types,
    /interface Events \{\n\s+"order\.shipped": DataOf<typeof import\('\.\/flows\/orders'\)\.orderShipped>/,
  )
})
