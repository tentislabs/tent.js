import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Type } from '../../core/index.ts'
import { json, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { copied, typed, typedApart } from './typed.ts'

const finding: Type = object({
  name: text(),
  kind: text(),
  file: text(),
  change: text(),
  reaches: number({ optional: true }),
  callers: number({ optional: true }),
})

// What `tent impact` prints with `--json`, as its value: the form of the impact as JSON.
const shape: Type = object({
  against: text(),
  rights: list(finding),
  breaks: list(finding),
  data: list(finding),
  work: list(finding),
  reaches: list(object({ name: text(), tree: json() })),
  tests: list(object({ name: text(), tests: list(text()) })),
  untested: list(text()),
  out: list(finding),
})

test('[44-2] tent test writes what each test touched into .tent/touched.json, and tent impact names the changes against a point with their tests, as text and with --json alike', async (t) => {
  const project = copied(t, 'impact')
  const temp = join(project, '..', 'temp')
  mkdirSync(temp)
  const was = ['TEMP', 'TMP', 'TMPDIR'].map((name) => [name, process.env[name]] as const)
  for (const [name] of was) process.env[name] = temp
  t.after(() => {
    for (const [name, value] of was)
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
  })
  assert.equal((await typed(project, 'history', 'save', 'first', '--json')).ended, 0)

  // Each test of the app, by its file and its name, with every definition it ran.
  const tested = typedApart(project, 'test', '--json')
  assert.equal(tested.ended, 0, tested.printed)
  const touched: Record<string, string[]> = JSON.parse(readFileSync(join(project, '.tent', 'touched.json'), 'utf8'))
  assert.deepEqual(Object.keys(touched).sort(), [
    'tests/orders.test.ts: a customer cannot mark an order paid',
    'tests/orders.test.ts: the staff may',
  ])
  assert.ok(Object.values(touched).every((names) => names.includes('markPaid')))

  // The rule of a change that tests touch is widened.
  const file = join(project, 'functions', 'orders.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      "export const markPaid = change('markPaid', {\n  access: role('staff'),",
      "export const markPaid = change('markPaid', {\n  access: anyone('a test widens it'),",
    ),
  )
  const asked = await typed(project, 'impact', 'first', '--json')
  assert.equal(asked.ended, 0, asked.printed)
  const value = Object(asked.answer.value)
  assert.deepEqual(checkValue(shape, value), [])
  assert.equal(value.against, 'first')
  assert.deepEqual(
    value.rights.map((one: { name: string; kind: string; change: string; file: string }) => [
      one.name,
      one.kind,
      one.change,
      one.file,
    ]),
    [['markPaid', 'change', 'now callable by anyone', 'functions/orders.ts']],
  )
  assert.deepEqual(value.tests, [{ name: 'markPaid', tests: Object.keys(touched).sort() }])
  assert.deepEqual(value.untested, [])

  // As text, the same, one line for each finding, under the heading of its part.
  const printed = (await typed(project, 'impact', 'first')).printed.split('\n')
  assert.equal(printed[0], 'Impact against first')
  assert.ok(printed.includes('Wider rights'))
  assert.ok(printed.includes('  markPaid (change, now callable by anyone)  functions/orders.ts'), printed.join('\n'))
  assert.ok(printed.includes('Tests'))
  // A point that is none is T9107.
  const missing = await typed(project, 'impact', 'nothere', '--json')
  assert.deepEqual([missing.ended, missing.answer.findings?.[0].code], [1, 'T9107'])
})
