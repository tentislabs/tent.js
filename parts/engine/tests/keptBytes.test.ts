import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptBytes } from '../keptBytes.ts'

test('[31-9] what is kept of the files that were served is held to a bound of bytes: where the bound is passed, the one asked for longest ago goes first', () => {
  const kept = keptBytes<string>(100)
  kept.put('a', 'the first', 40)
  kept.put('b', 'the second', 40)
  assert.deepEqual([kept.get('a'), kept.get('b'), kept.bytes()], ['the first', 'the second', 80])
  // `a` was asked for after `b`: one more that does not fit takes `b` away.
  kept.get('a')
  kept.put('c', 'the third', 40)
  assert.deepEqual(
    [kept.get('a'), kept.get('b'), kept.get('c'), kept.bytes()],
    ['the first', undefined, 'the third', 80],
  )
  // A thing that grew is counted at its new size, as a file that was packed beside its bytes is.
  kept.put('c', 'the third', 70)
  assert.deepEqual([kept.get('a'), kept.get('c'), kept.bytes()], [undefined, 'the third', 70])
  // One that is larger than the bound alone is kept for nobody.
  kept.put('d', 'too large', 101)
  assert.deepEqual([kept.get('d'), kept.get('c'), kept.bytes()], [undefined, 'the third', 70])
  // Many small ones never pass the bound.
  for (let k = 0; k < 1000; k++) kept.put(`small ${k}`, 'small', 7)
  assert.ok(kept.bytes() <= 100)
  assert.equal(kept.get('small 999'), 'small')
  assert.equal(kept.get('small 0'), undefined)
})
