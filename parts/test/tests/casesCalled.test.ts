import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evals, testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

test('[17-4] a tool that no answer called satisfies notCalled, and one that a run called satisfies called and not notCalled', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'assisted') })
  closing(t, () => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  app.fake('writer', [{ text: 'Fine.' }])
  const quiet = await evals(app, 'helper', [{ say: 'Hello.', expect: { text: 'Fine', notCalled: ['refund'] } }], {
    as: maya,
  })
  assert.deepEqual([quiet.passed, quiet.failed], [1, 0], JSON.stringify(quiet.each))
  // Each answer is given to one step of one run: each of the two cases asks for the refund, and then ends.
  const refunding = [{ text: 'Let me.', calls: [{ tool: 'refund', with: { order: 'o1' } }] }, { text: 'Done.' }]
  app.fake('writer', [...refunding, ...refunding])
  const loud = await evals(
    app,
    'helper',
    [
      { name: 'called', say: 'Refund o1.', approve: true, expect: { called: ['refund'] } },
      { name: 'not called', say: 'Refund o1.', approve: true, expect: { notCalled: ['refund'] } },
    ],
    { as: maya },
  )
  assert.deepEqual(
    loud.each.map((one) => [one.name, one.pass]),
    [
      ['called', true],
      ['not called', false],
    ],
  )
})
