import assert from 'node:assert/strict'
import { test } from 'node:test'
import { testApp } from '../index.ts'
import { current, level, moment, readersHeld, until } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

const origin = 'http://localhost'
const system = { as: 'system' } as const

test(
  '[21-7@6] [29-4] a watch that waited on a far reader for a write is run with the caller as they are when it runs: a role that the write it waited for took away answers it no more',
  readersHeld,
  async (t) => {
    tempOf(t)
    const app = await testApp({ folder: copyOf(t, 'gate') })
    closing(t, () => app.close())
    const near = await app.reader()
    const far = await app.reader({ far: true })
    await current(app, near, far)
    const ada = String((await app.user({ name: 'Ada', roles: ['staff'] })).user?.id)
    // A browser is Ada on the far reader, by a session that the writer made and the reader holds by its copy, and is
    // answered what her role lets her read.
    const cookie = app.session(ada)
    await level(app, near, far)
    const read = (): Promise<Response> =>
      far.request(
        new Request(`${origin}/_t/read/staffNotes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ input: {}, as: ada }),
        }),
      )
    const first = await read()
    assert.equal(first.status, 200)
    const epoch = String(first.headers.get('tent-at')).split('.')[0]
    assert.match(epoch, /^\d+$/, 'the answer of the reader names the write it stands at')

    // Her page opens its connection, and watches nothing yet.
    const got: Record<string, unknown>[] = []
    const end = far.live(
      new Request(`${origin}/_t/live?as=${encodeURIComponent(ada)}`, { headers: { origin, cookie } }),
    )
    end.each(
      (message) => {
        if (message.t === 'alive') end.send({ t: 'alive' })
        else got.push(message)
      },
      () => void got.push({ t: 'closed' }),
    )

    // The link carries nothing. The writer takes her role away: the far reader does not hold that write yet. The
    // write is answered only once the far reader holds it too, so the test goes on once the writer has committed it.
    far.hold()
    const before = app.at().n
    const written = app.write([{ change: 'users', id: ada, values: { roles: [] } }], system)
    await until('the writer has committed the write', () => app.at().n > before)
    const wanted = app.at().n
    assert.ok(far.at().n < wanted)

    // Her page watches the query, and names that write as seen: the watch waits for it, and nothing else passes
    // through the hub of the reader meanwhile.
    end.send({ t: 'watch', id: 'notes', query: 'staffNotes', input: {}, seen: `${epoch}.${wanted}` })
    await moment(300)
    assert.equal(got.length, 0)

    // The write arrives. The watch is run now, for the caller as she is now: she has no such role any more.
    far.release()
    await written
    await until('the watch was answered', () => got.length > 0)
    assert.deepEqual([got[0].t, got[0].id, Object(got[0].error).code], ['failed', 'notes', 'T3101'])
    end.close()
  },
)
