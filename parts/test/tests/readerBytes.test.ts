import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { beat, current, level } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'
import { bytesUnder } from './storms.ts'

const origin = 'http://localhost'

/** Calls a function on a machine as a browser would, with a cookie, and answers the wire form and the cookies that were set. */
async function called(machine: TestApp, name: string, input: object, o: { cookie?: string; as?: string } = {}) {
  const answer = await machine.request(
    new Request(`${origin}/_t/call/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(o.cookie ? { cookie: o.cookie } : {}) },
      body: JSON.stringify({ input, ...(o.as === undefined ? {} : { as: o.as }) }),
    }),
  )
  const wire: { ok: boolean; value?: unknown } = Object(await answer.json())
  return { wire, set: answer.headers.getSetCookie() }
}

/** How many files under a folder hold exactly these words. */
const copiesOf = (folder: string, words: string): number =>
  bytesUnder(folder).filter((one) => one.bytes.equals(Buffer.from(words))).length

test('[29-9@7a] a near reader holds the bytes of a file as soon as its row arrives: the write that made it is answered once the reader holds them, and a reader that takes over hands the file out', async (t) => {
  const temp = tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'filed') })
  closing(t, () => app.close())
  const near = await app.reader()
  await current(app, near)
  const signed = await called(app, 'signIn', { email: 'maya@example.com' })
  const cookie = signed.set[0].split(';')[0]
  const maya = String((await app.rows('users')).find((one) => one.email === 'maya@example.com')?.id)
  await level(app, near)

  const words = 'the words that the near reader holds'
  const made = await called(app, 'putText', { words }, { cookie, as: maya })
  assert.equal(made.wire.ok, true, JSON.stringify(made.wire))
  const id = String(made.wire.value)
  // Answered once the near reader holds the bytes: they lie in the folder of the writer and in that of the reader.
  assert.equal(copiesOf(temp, words), 2)

  // The writer is gone: the reader takes over, and hands the file out with the bytes it holds.
  await app.kill()
  await beat(near, 7)
  await near.takeOver()
  const got = await near.request(new Request(`${origin}/_t/files/${id}`, { headers: { cookie } }))
  assert.deepEqual([got.status, await got.text()], [200, words])
})
