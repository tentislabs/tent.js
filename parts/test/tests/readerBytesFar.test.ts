import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { current, level, until } from './many.ts'
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
  const wire: { ok: boolean; value?: unknown; error?: { code: string } } = Object(await answer.json())
  return { wire, set: answer.headers.getSetCookie() }
}

/** A download asked of a machine, as a browser with that cookie asks it. */
async function downloaded(machine: TestApp, id: string, cookie: string): Promise<{ status: number; text: string }> {
  const answer = await machine.request(new Request(`${origin}/_t/files/${id}`, { headers: { cookie } }))
  return { status: answer.status, text: await answer.text() }
}

/** How many files under a folder hold exactly these words. */
const copiesOf = (folder: string, words: string): number =>
  bytesUnder(folder).filter((one) => one.bytes.equals(Buffer.from(words))).length

/** The writer with its user signed in: the cookie of the session, and the id of the user. */
async function signedIn(app: TestApp): Promise<{ cookie: string; maya: string }> {
  const signed = await called(app, 'signIn', { email: 'maya@example.com' })
  const maya = String((await app.rows('users')).find((one) => one.email === 'maya@example.com')?.id)
  // The cookie of the session, by its name: the answer sets the mark of what it wrote beside it, in no fixed order.
  const session = signed.set.find((line) => line.startsWith('tent_session.')) ?? ''
  return { cookie: session.split(';')[0], maya }
}

test('[29-9@7a] the far reader fetches a file the first time it is asked for it, keeps it and answers it with no writer after, and answers T0029 for one it never fetched while it cannot reach the writer', async (t) => {
  const temp = tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'filed') })
  closing(t, () => app.close())
  const far = await app.reader({ far: true })
  const { cookie, maya } = await signedIn(app)
  const [one, two] = ['the first words of the far reader', 'words the far reader never asked for']
  const first = String((await called(app, 'putText', { words: one }, { cookie, as: maya })).wire.value)
  const second = String((await called(app, 'putText', { words: two }, { cookie, as: maya })).wire.value)
  await current(app, far)
  await level(app, far)
  // A far reader holds the rows and fetches no bytes until it is asked for them.
  assert.deepEqual([copiesOf(temp, one), copiesOf(temp, two)], [1, 1])
  assert.deepEqual(await downloaded(far, first, cookie), { status: 200, text: one })
  assert.equal(copiesOf(temp, one), 2)
  // With the writer gone, what it fetched is answered, and what it never fetched is T0029.
  await app.kill()
  assert.deepEqual(await downloaded(far, first, cookie), { status: 200, text: one })
  const never = await downloaded(far, second, cookie)
  assert.equal(never.status, 503, never.text)
  assert.equal(Object(JSON.parse(never.text)).error?.code, 'T0029')
})

test('[29-9@7a] a near reader that joins holds the bytes of every file before it is current, and removes the bytes of a file once its last row has left', async (t) => {
  const temp = tempOf(t)
  // A removed file is kept two minutes in place of seven days: a jump of the clock over seven days beats the link
  // some 600,000 times and writes the counts some 10,000 times, which the reader takes in for minutes after it.
  const folder = copyOf(t, 'filed')
  const project = join(folder, 'tent.ts')
  writeFileSync(
    project,
    readFileSync(project, 'utf8').replace(
      'screensPerMinute: 100000 }',
      "screensPerMinute: 100000, filesKept: '2 minutes' }",
    ),
  )
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const { cookie, maya } = await signedIn(app)
  const words = 'the words that were there before the reader'
  const id = String((await called(app, 'putText', { words }, { cookie, as: maya })).wire.value)
  // The reader that joins after the file was made is current only once it holds its bytes too.
  const near = await app.reader()
  await current(app, near)
  assert.equal(copiesOf(temp, words), 2)
  assert.deepEqual(await downloaded(near, id, cookie), { status: 200, text: words })
  // The file is loose and held by nothing: after its hour it is removed, and after filesKept it is gone, with its
  // bytes on the writer and on the reader. The reader removes its bytes as it takes the write that removed the row,
  // before it tells the writer it holds it: so the bytes are looked for once the reader holds every write.
  app.clock.advance('61 minutes')
  app.clock.advance('3 minutes')
  await level(app, near)
  await until('the bytes are gone from both machines', () => copiesOf(temp, words) === 0)
})
