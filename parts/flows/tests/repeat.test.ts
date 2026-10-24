import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bench } from './bench.ts'

test('[23-14] a step name that the body of a flow writes twice gives the second step its repeat number, and a later pass reads each by its own', async (t) => {
  const made: string[] = []
  const b = bench(t, {
    twice: async ({ step }) => {
      const first = await step('send', () => {
        made.push('first')
        return 'a'
      })
      const second = await step('send', () => {
        made.push('second')
        return 'b'
      })
      await step.wait('1 day')
      // The same name once more, after the wait, and in a loop: each is a step of its own.
      const rest: unknown[] = []
      for (const letter of ['c', 'd']) rest.push(await step('send', () => letter))
      return [first, second, ...rest].join('')
    },
  })
  const run = b.start('twice')
  await b.until(run, 'waiting')
  assert.deepEqual(
    b.runner.read(run)?.steps.map((step) => [step.name, step.repeat, step.result]),
    [
      ['send', 1, 'a'],
      ['send', 2, 'b'],
      ['wait', 1, undefined],
    ],
  )
  b.clock.advance(86_400_000)
  assert.equal(await b.runner.wait(run), 'abcd')
  // The pass after the wait read the two saved steps, each under its number, and carried neither out again.
  assert.deepEqual(made, ['first', 'second'])
  assert.deepEqual(
    b.runner
      .read(run)
      ?.steps.filter((step) => step.name === 'send')
      .map((step) => [step.repeat, step.result]),
    [
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
      [4, 'd'],
    ],
  )
})
