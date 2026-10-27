import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { current, level, moment, readersHeld } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

const origin = 'http://localhost'

/** Signs Maya in on the writer, and answers the cookie of her session. */
async function signedIn(app: TestApp): Promise<string> {
  const answer = await app.request(
    new Request(`${origin}/_t/call/signIn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ input: { email: 'maya@example.com' } }),
    }),
  )
  return answer.headers.getSetCookie()[0].split(';')[0]
}

test(
  "[29-9] [05-2.11] an upload that a reader got and that keeps arriving for longer than limits.behind is the writer's: the reader hands it on as it arrives, and the writer is not given up on while it arrives",
  readersHeld,
  async (t) => {
    tempOf(t)
    const app = await testApp({ folder: copyOf(t, 'filed') })
    closing(t, () => app.close())
    const near = await app.reader()
    await current(app, near)
    const cookie = await signedIn(app)
    await level(app, near)
    // A sender on a slow line: the first half arrives now, the rest once more than `behind` (5 seconds) has passed.
    let more: ReadableStreamDefaultController<Uint8Array> | undefined
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        more = controller
        controller.enqueue(new TextEncoder().encode('upl'))
      },
    })
    const how: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: {
        origin,
        cookie,
        'content-type': 'text/plain',
        'content-length': '8',
      },
      body,
      duplex: 'half',
    }
    const answering = near.request(new Request(`${origin}/_t/files?name=up.txt`, how))
    await moment(50)
    // Six seconds of a line that carries a byte now and then, which `web.bodySpeed` would not close on its own.
    for (let i = 0; i < 6; i++) {
      app.clock.advance('1 second')
      await moment(15)
    }
    more?.enqueue(new TextEncoder().encode('oaded'))
    more?.close()
    let settled: Response | undefined
    void answering.then((one) => (settled = one))
    for (let i = 0; i < 40 && !settled; i++) {
      app.clock.advance('1 second')
      await moment(30)
    }
    const up = await answering
    const told = Object(await up.json())
    assert.equal(told.ok, true, JSON.stringify(told))
    assert.deepEqual([Object(told.value).name, Object(told.value).size], ['up.txt', 8])
  },
)
