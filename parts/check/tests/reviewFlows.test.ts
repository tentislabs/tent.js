import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf, lineWith } from './copies.ts'

const file = 'flows/orders.ts'

/** A project of these tests, copied, with the findings of the rules of the flows in it, each by its line. */
async function found(name: string, code: string): Promise<{ line: number; message: string }[]> {
  const folder = copyOf(join('reviewFlows', name), `review-${name}`)
  const { findings } = await checkRules(folder, {})
  return findings
    .filter((one) => one.code === code && one.where?.file === file)
    .map((one) => ({ line: one.where?.line ?? 0, message: one.message }))
}

test('[23-5] the check finds no work outside a step where the step tool has another name, and finds a drawn word that was imported under another name', async () => {
  const text = readFileSync(join(import.meta.dirname, 'reviewFlows', 'renamed', file), 'utf8')
  const lines = (await found('renamed', 'T5001')).map((one) => one.line)
  assert.deepEqual(lines, [lineWith(text, 'const at = clock()')])
})

test('[23-6] the check reports a step that is not awaited, also where it stands in an arrow, behind `void`, or with `then`', async () => {
  const text = readFileSync(join(import.meta.dirname, 'reviewFlows', 'unawaited', file), 'utf8')
  const lines = (await found('unawaited', 'T5002')).map((one) => one.line).sort((a, b) => a - b)
  assert.deepEqual(lines, [
    lineWith(text, "void step('first'"),
    lineWith(text, 'forEach((title) => step('),
    lineWith(text, "step('then'"),
  ])
})
