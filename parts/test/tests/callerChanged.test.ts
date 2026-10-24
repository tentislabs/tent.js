import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const origin = 'http://localhost'

/** Sends a call or a read of a page that names the user it was drawn for, as a browser with that cookie does. */
async function asked(app: TestApp, kind: 'call' | 'read', name: string, as: string, cookie?: string) {
  const answer = await app.request(
    new Request(`${origin}/_t/${kind}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ input: {}, as }),
    }),
  )
  return { status: answer.status, wire: Object(await answer.json()) }
}

/** What a live connection of a page drawn for a user is sent before it is closed, as a browser with that cookie. */
async function watched(app: TestApp, as: string, cookie?: string): Promise<{ heard: string[]; closed: boolean }> {
  const live = app.live(
    new Request(`${origin}/_t/live?as=${as}`, { headers: { origin, ...(cookie ? { cookie } : {}) } }),
  )
  const heard: string[] = []
  let closed = false
  live.each(
    (message) => heard.push(String(message.t)),
    () => {
      closed = true
    },
  )
  live.send({ t: 'watch', id: 'w1', query: 'whoAmI', input: {} })
  for (let i = 0; i < 400 && !closed; i++) await new Promise((done) => setTimeout(done, 5))
  return { heard, closed }
}

test('[22-1@7a] a page drawn for one user, in a browser that is now another user or nobody, is answered that the caller changed for every read too: a query called, a read, and a watch, and nothing of the rows', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'filed') })
  closing(t, () => app.close())
  const users = await app.rows('users')
  const maya = String(users.find((one) => one.email === 'maya@example.com')?.id)
  const signIn = async (email: string): Promise<string> => {
    const answer = await app.request(
      new Request(`${origin}/_t/call/signIn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ input: { email } }),
      }),
    )
    return answer.headers.getSetCookie()[0].split(';')[0]
  }
  const ofMaya = await signIn('maya@example.com')
  // The page of maya, in her own browser, is answered as ever.
  assert.deepEqual((await asked(app, 'read', 'whoAmI', maya, ofMaya)).wire, { ok: true, value: maya })

  // The same browser signed in as another user, and a browser that is nobody.
  for (const [who, cookie] of [
    ['another user', await signIn('omar@example.com')],
    ['nobody', undefined],
  ] as const) {
    for (const kind of ['call', 'read'] as const) {
      const { status, wire } = await asked(app, kind, 'whoAmI', maya, cookie)
      assert.deepEqual(
        [status, wire.ok, wire.error?.code, wire.caller, 'value' in wire],
        [403, false, 'T3101', 'changed', false],
        `${kind} as ${who}`,
      )
    }
    const live = await watched(app, maya, cookie)
    assert.deepEqual(live, { heard: ['changed'], closed: true }, `a watch as ${who}`)
  }
})
