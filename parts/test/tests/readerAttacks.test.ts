import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { beat, current, level, readersHeld, send } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** The `name=value` of each cookie that an answer set, as a browser sends them back. */
const cookiesOf = (headers: Headers): string[] => headers.getSetCookie().map((line) => line.split(';')[0])

test(
  '[29-11.12] a route on the writer that sends every header of its request on, called through a reader, is handed nothing of the key of the reader',
  readersHeld,
  async (t) => {
    tempOf(t)
    const app = await testApp({ folder: copyOf(t, 'routed') })
    closing(t, () => app.close())
    const near = await app.reader()
    await current(app, near)
    const answer = await near.request(new Request('http://localhost/handed-all'))
    const handed: Record<string, string> = Object(await answer.json())
    assert.equal(answer.status, 200)
    // No header that the reader added reaches the code of the route: no key, no name of the link.
    assert.deepEqual(
      Object.keys(handed).filter((name) => name.startsWith('tent-') || name === 'authorization'),
      [],
    )
    assert.equal(
      Object.values(handed).some((value) => /bearer/i.test(value)),
      false,
    )
  },
)

test(
  '[29-11.4] a reader that was cut off, asked with a session that was ended meanwhile, answers nothing itself after behind',
  readersHeld,
  async (t) => {
    tempOf(t)
    const app: TestApp = await testApp({ folder: copyOf(t, 'many') })
    closing(t, () => app.close())
    const near = await app.reader()
    await current(app, near)
    const maya = String((await app.user({ name: 'maya', roles: [] })).user?.id)
    const session = cookiesOf((await send(app, 'signIn', { user: maya })).headers).find((one) =>
      one.includes('tent_session'),
    )
    assert.ok(session)
    await level(app, near)
    /** Who the page of maya is answered to be, on a machine. */
    const who = async (machine: TestApp): Promise<unknown> => {
      const answer = await machine.request(
        new Request('https://many.test/_t/read/whoAmI', {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: session },
          body: JSON.stringify({ input: {}, as: maya }),
        }),
        { from: '10.9.201.1' },
      )
      return Object(await answer.json())
    }
    assert.deepEqual(await who(near), { ok: true, value: maya })
    // The reader is cut off, and the session ends on the writer meanwhile.
    near.cut()
    const ended = await app.request(
      new Request('https://many.test/_t/call/signOut', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: session },
        body: JSON.stringify({ input: {}, as: maya }),
      }),
      { from: '10.9.201.1' },
    )
    assert.equal(ended.status, 200)
    // After behind it answers nothing itself: the read goes to the writer, which knows the session no more.
    await beat(near, 7)
    const after = await who(near)
    assert.notDeepEqual(after, { ok: true, value: maya })
  },
)
