import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { earlier, later, chunks, sum, where } from '../index.ts'
import { lengthOf, setRuntime } from '../internal.ts'
import { testRuntime } from './bodies-world.ts'

afterEach(() => setRuntime(null))

/** What a piece of work threw, as the error of ours it should be. */
function thrownBy(work: () => unknown): { code?: string; message: string } {
  try {
    work()
  } catch (error) {
    return { code: Reflect.get(Object(error), 'code'), message: String(Reflect.get(Object(error), 'message')) }
  }
  assert.fail('nothing was thrown')
}

test('[12-1] a length of time reads only the units of its table: a name that every object has is no unit', () => {
  // `constructor` reads as a name of the table of units, which holds it from the runtime and not as a unit.
  assert.equal(lengthOf('2 constructors'), undefined)
  assert.equal(lengthOf('1 constructor'), undefined)
  for (const word of [later, earlier]) {
    const error = thrownBy(() => word(new Date('2026-10-08T12:00:00.000Z'), '1 constructor'))
    assert.equal(error.code, 'T0027')
    assert.match(error.message, /a length of time/)
  }
})

test("[12-1] where and sum read a row's own fields and nothing else: a name a row has only from the runtime meets nothing", () => {
  const rows = [{ name: 'a', total: 3 }]
  // `toString` is no field of the row, so it is empty there, and the row does not fit a filter that wants it filled.
  assert.deepEqual(where(rows, { toString: { empty: false } }), [])
  assert.deepEqual(where(rows, { toString: { empty: true } }), rows)
  // A name that meets nothing on its way gives nothing, and an entry that holds nothing is passed over.
  assert.equal(sum(rows, 'constructor'), 0)
})

test('[12-1] chunks makes a list of valueSize entries at most, as every word that makes a list: T0027 beyond it', () => {
  setRuntime(testRuntime(() => undefined, true, 10))
  // Sixteen chunks of one character each, where the app of the call holds a value to ten entries.
  const error = thrownBy(() => chunks('abcdefghijklmnop', { size: 1, overlap: 0, cut: 'length' }))
  assert.equal(error.code, 'T0027')
  assert.match(error.message, /valueSize of 10/)
})
