import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { appIn } from './desks.ts'
import { until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const
const nobody = { as: { kind: 'nobody' } } as const

const more = `
export const whoIsHereHeavy = query('whoIsHereHeavy', {
  access: open,
  heavy: true,
  rows: presence.oldest('createdAt').limit(100),
})
`

/** The app of who is here, with a heavy query of it, and Maya at a document. */
async function around(t: TestContext): Promise<{ app: TestApp; maya: string }> {
  const folder = copyOf(t, 'presence')
  appendFileSync(join(folder, 'functions', 'functions.ts'), more)
  const { app } = await appIn(t, folder)
  const written: unknown = await app.write([{ add: 'users', values: { name: 'Maya' } }], system)
  const maya = String(Reflect.get(Object(Array.isArray(written) ? written[0] : undefined), 'id'))
  await app.call('here', { user: maya, doc: 'plan' }, system)
  return { app, maya }
}

const docsOf = (answer: unknown): unknown[] =>
  (Array.isArray(answer) ? answer : []).map((one) => Reflect.get(Object(one), 'doc'))

test('[45-19.5] a row of a memory table is read by a heavy query where it lives, and is gone after `lasts` for it too', async (t) => {
  const { app } = await around(t)
  assert.deepEqual(docsOf(await app.call('whoIsHereHeavy', {}, nobody)), ['plan'])
  app.clock.advance('31 seconds')
  assert.deepEqual(docsOf(await app.call('whoIsHereHeavy', {}, nobody)), [])
})

test('[45-19.5] a reader answers the rows of a memory table it was handed, and none past `lasts`', async (t) => {
  const { app, maya } = await around(t)
  const reader = await app.reader()
  // The writer opens anew with the keys of its readers when the first is asked for: the row is written after it.
  await app.call('here', { user: maya, doc: 'plan' }, system)
  await until('the reader holds the row of who is here', async () => {
    const read = await reader.call('whoIsHere', {}, nobody).catch(() => [])
    return docsOf(read).includes('plan')
  })
  app.clock.advance('31 seconds')
  assert.deepEqual(docsOf(await reader.call('whoIsHere', {}, nobody)), [])
})
