import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { current, level, moment, readersHeld } from './many.ts'
import { closing, copyOf } from './projects.ts'

const origin = 'http://localhost'

// A store of the bytes of files that keeps them and hands none out: a near reader never gets the bytes of a file.
const keepsAndHandsNothing = `import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import type { Makers } from 'tentjs/engine'

export default {
  files: ({ dataFolder }) => ({
    async put(fingerprint, bytes) {
      mkdirSync(join(dataFolder, 'kept'), { recursive: true })
      await bytes.pipeTo(Writable.toWeb(createWriteStream(join(dataFolder, 'kept', fingerprint))))
    },
    get() {
      throw new Error('this store hands out no bytes')
    },
    async remove() {},
  }),
} satisfies Makers
`

async function called(machine: TestApp, name: string, input: object, o: { cookie?: string; as?: string } = {}) {
  const answer = await machine.request(
    new Request(`${origin}/_t/call/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(o.cookie ? { cookie: o.cookie } : {}) },
      body: JSON.stringify({ input, ...(o.as === undefined ? {} : { as: o.as }) }),
    }),
  )
  return { wire: Object(await answer.json()), set: answer.headers.getSetCookie() }
}

test(
  '[29-9@7a] the writer closes the link of a near reader that has not sent `has` for the bytes of a file within `behind` of its `at`, and the write is settled without it',
  readersHeld,
  async (t) => {
    const folder = copyOf(t, 'filed')
    writeFileSync(join(folder, 'engine.ts'), keepsAndHandsNothing)
    const app = await testApp({ folder })
    closing(t, () => app.close())
    const near = await app.reader()
    await current(app, near)
    const signed = await called(app, 'signIn', { email: 'maya@example.com' })
    const cookie = signed.set[0].split(';')[0]
    const maya = String((await app.rows('users')).find((one) => one.email === 'maya@example.com')?.id)
    await level(app, near)
    const before = app.machines().find((one) => one.role === 'reader')?.since
    let answered = false
    const made = called(app, 'putText', { words: 'bytes the reader never gets' }, { cookie, as: maya }).finally(() => {
      answered = true
    })
    await moment(300)
    assert.equal(answered, false, 'the write waits for the reader that lacks the bytes')
    for (let i = 0; i < 40 && !answered; i++) {
      app.clock.advance('1 second')
      await moment(30)
    }
    assert.equal((await made).wire.ok, true)
    // The link of the reader was closed: it has joined anew since, as a reader whose link closed dials again.
    const joined = app.machines().find((one) => one.role === 'reader')?.since
    assert.notEqual(joined, before, JSON.stringify(app.machines()))
  },
)
