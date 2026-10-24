import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fail } from '../index.ts'

/** What a piece of work threw, as the error of ours it should be. */
function thrownBy(work: () => unknown): { code: unknown; fix: unknown } {
  try {
    work()
  } catch (error) {
    return { code: Reflect.get(Object(error), 'code'), fix: Reflect.get(Object(error), 'fix') }
  }
  assert.fail('nothing was thrown')
}

test("[16-2] fail with a code of the form of a framework code is refused where it is thrown, T0013 whose fix names the rule; a code of the builder's own is thrown as it is", () => {
  for (const code of ['T0006', 'T0007', 'T2001']) {
    const thrown = thrownBy(() => fail(code, 'You need to sign in.'))
    assert.equal(thrown.code, 'T0013', code)
    assert.match(String(thrown.fix), /lowercase word with letters, digits and hyphens/)
  }
  assert.equal(thrownBy(() => fail('sold-out', 'This is sold out.')).code, 'sold-out')
})
