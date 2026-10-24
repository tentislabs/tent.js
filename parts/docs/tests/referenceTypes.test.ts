import assert from 'node:assert/strict'
import { test } from 'node:test'
import { referenceText } from '../index.ts'

test('[15-8] a type written over several lines stands in the reference as TypeScript writes it on one, each member after its separator', () => {
  const lines = referenceText()
    .split('\n')
    // A member marked `readonly` is read without the mark, and the comment of a line is no type.
    .map((line) => line.replace(/ \/\/ .*$/, '').replace(/\breadonly /g, ''))
  // Two members of a record with nothing between them, as `steps: number perRun: Units`, are no TypeScript.
  const joined = lines.filter((line) => /[\w>\])'"?] [A-Za-z_$][\w$]*\??: /.test(line))
  assert.deepEqual(joined, [])
  // The members of a record keep their separators.
  const limits = lines.find((line) => line.startsWith('  limits?: { steps?: number'))
  assert.ok(limits, 'the limits of an agent stand in the reference')
  assert.match(limits, /steps\?: number; perRun\?: Units; /)
})
