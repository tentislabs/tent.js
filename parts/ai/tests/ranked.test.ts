import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'

/** A test app of the library: Maya's three articles, and one of Bob's that she may not read. */
async function library(t: test.TestContext): Promise<{ app: TestApp; maya: Caller; ids: Record<string, string> }> {
  const app = await testApp({ folder: copyOf(t, 'ranked') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const bob = await app.user({ name: 'Bob', roles: [] })
  const made = await app.write(
    [
      { add: 'articles', values: { title: 'red tent', meaning: [1, 0, 0], by: maya.user?.id } },
      { add: 'articles', values: { title: 'red red tent tent', meaning: [0, 1, 0], by: maya.user?.id } },
      { add: 'articles', values: { title: 'blue lamp', meaning: [0.9, 0.1, 0], by: maya.user?.id } },
      { add: 'articles', values: { title: 'red tent secret', meaning: [1, 0, 0], by: bob.user?.id } },
    ],
    { as: 'system' },
  )
  const [a, b, c, d] = (Array.isArray(made) ? made : []).map((row) => String(Reflect.get(Object(row), 'id')))
  return { app, maya, ids: { a: a ?? '', b: b ?? '', c: c ?? '', d: d ?? '' } }
}

/** The rows a call answered, each as a record. */
const rowsOf = (answer: unknown): Record<string, unknown>[] => (Array.isArray(answer) ? answer.map(Object) : [])

test('[47-3] a plan with `search` and `near` answers one list joined by rank, under the rule, with `distance` and `rank` on each row', async (t) => {
  const { app, maya, ids } = await library(t)
  const rows = rowsOf(await app.as(maya).call('both', { words: 'red tent', to: [1, 0, 0] }))
  // The tent in both lists comes first, the one the words find second, and the lamp that only its meaning finds last.
  assert.deepEqual(
    rows.map((row) => row.id),
    [ids.a, ids.b, ids.c],
  )
  assert.deepEqual(
    rows.map((row) => row.rank),
    [1, 2, 3],
  )
  assert.equal(rows[0]?.distance, 0)
  assert.ok(Number(rows[2]?.distance) > 0 && Number(rows[2]?.distance) < 0.1)
  assert.ok(!rows.some((row) => row.id === ids.d), "a row of Bob's is in neither list")
})

test('[47-3] `rank` reorders the rows by a model that ranks, keeps `top` of them, and is handed no row the caller may not read', async (t) => {
  const { app, maya, ids } = await library(t)
  const faked = app.fake('reranker', {
    rank: (_words: string, texts: string[]) => texts.map((one) => (one.includes('lamp') ? 0.9 : 0.5)),
  })
  const rows = rowsOf(await app.as(maya).call('ranked', { words: 'red tent', to: [1, 0, 0] }))
  assert.deepEqual(
    rows.map((row) => row.id),
    [ids.c, ids.a],
  )
  assert.equal(faked.sent.length, 1)
  assert.equal(faked.sent[0]?.call, 'rank')
  assert.deepEqual(Object(faked.sent[0]?.input).texts, ['red tent', 'red red tent tent', 'blue lamp'])
})

test('[47-3] a plan that ranks is refused in a query, where no model may be called', async (t) => {
  const { app, maya } = await library(t)
  app.fake('reranker', { rank: (_words: string, texts: string[]) => texts.map(() => 1) })
  await assert.rejects(
    app.as(maya).call('rankedRead', { words: 'red tent' }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'T0013',
  )
})
