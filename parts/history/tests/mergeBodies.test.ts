import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeBody } from '../merge/bodies.ts'
import type { FieldApart } from '../merge/values.ts'

const thank = { fn: 'step', args: ['thank', 'thanks'] }
/** A stored body around one step: a const before it and a return after it. */
const body = (greeting: string, last: number): unknown[] => [
  { const: 'greeting', value: greeting },
  thank,
  { return: last },
]
const where = { option: 'body', owner: 'followUp', front: '' }

test('[40-4] two bodies around their steps are merged by their stored statements: what each side changed is taken, and one statement that both changed clashes', () => {
  const apart: FieldApart[] = []
  const merged = mergeBody(body('Hello', 1), body('Hi', 1), body('Hello', 2), apart, where)
  assert.deepEqual(apart, [], 'ours changed the const and theirs the return')
  assert.deepEqual(merged, body('Hi', 2))

  const clash: FieldApart[] = []
  const kept = mergeBody(body('Hello', 1), body('Hi', 1), body('Hey', 1), clash, where)
  assert.deepEqual(
    clash.map((one) => one.path),
    [['body']],
    'both changed the const: the body around clashes',
  )
  assert.deepEqual(kept, body('Hi', 1), 'ours stays')
})
