import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caller } from '../index.ts'

test("[11-6] caller('id') is the only form of caller: any other is refused with T1014 when it is written", () => {
  assert.deepEqual({ ...Object(caller('id')) }, { caller: 'id' })
  // The type takes only 'id', so the other form is handed as a file of plain JavaScript would hand it.
  assert.throws(() => Reflect.apply(caller, undefined, ['name']), { code: 'T1014' })
})
