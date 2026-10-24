import assert from 'node:assert/strict'
import test from 'node:test'
import { appIn } from './desks.ts'
import { until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const
const nobody = { as: { kind: 'nobody' } } as const

const docsOf = (answer: unknown): unknown[] =>
  (Array.isArray(answer) ? answer : []).map((one) => Reflect.get(Object(one), 'doc'))

test('[45-7] a reader holds the rows of a table kept in memory that its writer holds when it joins and writes later, answers them as the writer does, and none past `lasts`', async (t) => {
  const { app } = await appIn(t, copyOf(t, 'presence'))
  const first = await app.reader()
  // The writer was opened anew with the keys of its readers: a row written from here on is the writer's.
  const written: unknown = await app.write([{ add: 'users', values: { name: 'Maya' } }], system)
  const maya = String(Reflect.get(Object(Array.isArray(written) ? written[0] : undefined), 'id'))
  await app.call('here', { user: maya, doc: 'plan' }, system)
  await until('the reader that was joined is handed the row', async () =>
    docsOf(await first.call('whoIsHere', {}, nobody)).includes('plan'),
  )
  // A reader that joins later is handed what the writer holds in memory as it joins.
  const later = await app.reader()
  await until('the reader that joined later holds the row', async () =>
    docsOf(await later.call('whoIsHere', {}, nobody).catch(() => [])).includes('plan'),
  )
  app.clock.advance('31 seconds')
  assert.deepEqual(docsOf(await first.call('whoIsHere', {}, nobody)), [])
  assert.deepEqual(docsOf(await later.call('whoIsHere', {}, nobody)), [])
})
