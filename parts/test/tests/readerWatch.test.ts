import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { current, level, until } from './many.ts'
import { closing, copyOf } from './projects.ts'

const origin = 'http://localhost'

const keep = async (app: TestApp, title: string): Promise<void> => {
  const answer = await app.request(
    new Request(`${origin}/_t/call/keep`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ input: { title, note: `the note of ${title}` } }),
    }),
  )
  assert.equal(Object(await answer.json()).ok, true)
}

test('[29-9@7a] a watch on a reader of a query that meets a sealed value the reader cannot open is answered through the writer, first and each time a write marks it', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'vaulted'), secrets: { API_KEY: 'the-key-of-the-test' } })
  closing(t, () => app.close())
  await keep(app, 'a')
  // The reader holds no key: it cannot open the notes itself.
  const near = await app.reader()
  await current(app, near)
  await level(app, near)
  const heard: Record<string, unknown>[] = []
  const live = near.live(new Request(`${origin}/_t/live`, { headers: { origin } }))
  live.each((message) => {
    heard.push(message)
    if (message.t === 'alive') live.send({ t: 'alive' })
  })
  live.send({ t: 'watch', id: 'w1', query: 'kept', input: {} })
  const results = (): unknown[] => heard.filter((one) => one.t === 'result').map((one) => one.value)
  await until('the first answer of the watch', () => results().length === 1)
  assert.deepEqual(results(), [[{ title: 'a', note: 'the note of a' }]])
  assert.deepEqual(
    heard.filter((one) => one.t === 'failed'),
    [],
  )
  // A write on the writer reaches the reader, marks the group, and it is answered through the writer again.
  await keep(app, 'b')
  await level(app, near)
  await until('the watch was answered after the write', () => results().length === 2)
  assert.deepEqual(results()[1], [
    { title: 'a', note: 'the note of a' },
    { title: 'b', note: 'the note of b' },
  ])
  live.close()
})
