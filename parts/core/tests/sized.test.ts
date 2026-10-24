import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { calc, TentError } from '../index.ts'
import { runBody, setRuntime, valueOf } from '../internal.ts'
import { testRuntime } from './bodies-world.ts'

afterEach(() => setRuntime(null))

/** What a piece of work throws, as a `TentError`: its code and its words. */
function thrownBy(work: () => unknown): { code?: string; message: string } {
  try {
    work()
  } catch (error) {
    return error instanceof TentError ? error : { message: String(error) }
  }
  return { message: 'nothing was thrown' }
}

/** A body of statements that each double a text with the sign `+`, and answer how long it is. */
const doubledBySign = (times: number): object[] => [
  { const: 'seed', value: '0123456789' },
  ...Array.from({ length: times }, (_, i) => {
    const from = { name: [i === 0 ? 'seed' : `t${i}`] }
    return { const: `t${i + 1}`, value: { left: from, op: '+', right: from } }
  }),
  { return: { name: [`t${times}`, 'length'] } },
]

test('[12-2a] the sign that joins two texts in a body makes a text of valueSize characters at the most, as a word does: T0027 beyond it', () => {
  // Sixteen doublings of ten characters are 655,360, and seventeen are past the 1,000,000 of an empty slot.
  assert.equal(runBody(doubledBySign(16), {}), 655_360)
  const over = thrownBy(() => runBody(doubledBySign(17), {}))
  assert.equal(over.code, 'T0027')
  assert.match(over.message, /valueSize of 1000000/)
  // Forty doublings end at the seventeenth: nothing larger is ever made.
  assert.equal(thrownBy(() => runBody(doubledBySign(40), {})).code, 'T0027')
  // The limit is the one of the app whose call is under way.
  setRuntime(testRuntime(() => undefined, true, 5))
  assert.equal(valueOf({ left: 'abc', op: '+', right: 'de' }), 'abcde')
  assert.match(thrownBy(() => valueOf({ left: 'abc', op: '+', right: 'def' })).message, /valueSize of 5/)
  // A text and a number are joined to a text, and held as one: numbers alone are added, whatever they come to.
  assert.equal(thrownBy(() => valueOf({ left: 'abcde', op: '+', right: 7 })).code, 'T0027')
  assert.equal(thrownBy(() => valueOf({ left: 12345, op: '+', right: 'x' })).code, 'T0027')
  assert.equal(valueOf({ left: 600_000, op: '+', right: 700_000 }), 1_300_000)
  assert.equal(valueOf({ left: 'ab', op: '+', right: 7 }), 'ab7')
  // `calc` is the sign it names, and is held the same.
  assert.equal(thrownBy(() => Reflect.apply(calc, undefined, ['+', 'abc', 'def'])).code, 'T0027')
  assert.equal(valueOf({ calc: '+', left: 'ab', right: 'cd' }), 'abcd')
  assert.equal(thrownBy(() => valueOf({ calc: '+', left: 'abc', right: 'def' })).code, 'T0027')
})

test('[12-2a] a text with values in a body makes a text of valueSize characters at the most: T0027 beyond it, before the text is made', () => {
  const names = { half: 'x'.repeat(500_000) }
  const made = valueOf({ text: [{ name: ['half'] }, { name: ['half'] }] }, { names })
  assert.equal(String(made).length, 1_000_000)
  const over = thrownBy(() => valueOf({ text: [{ name: ['half'] }, 'y', { name: ['half'] }] }, { names }))
  assert.equal(over.code, 'T0027')
  assert.match(over.message, /valueSize of 1000000/)
  // In a body that doubles with it, the same.
  const doubled: object[] = [
    { const: 'seed', value: '0123456789' },
    ...Array.from({ length: 40 }, (_, i) => {
      const from = { name: [i === 0 ? 'seed' : `t${i}`] }
      return { const: `t${i + 1}`, value: { text: [from, from] } }
    }),
    { return: { name: ['t40', 'length'] } },
  ]
  assert.equal(thrownBy(() => runBody(doubled, {})).code, 'T0027')
  setRuntime(testRuntime(() => undefined, true, 5))
  assert.equal(valueOf({ text: ['ab', { name: ['n'] }] }, { names: { n: 123 } }), 'ab123')
  assert.equal(thrownBy(() => valueOf({ text: ['abc', { name: ['n'] }] }, { names: { n: 123 } })).code, 'T0027')
})
