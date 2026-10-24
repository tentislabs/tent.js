import assert from 'node:assert/strict'
import { test } from 'node:test'
import { callerIdOf, mcpApp } from './mcpApp.ts'
import { current, level, until } from './many.ts'

/** The project of sign-in for programs as a writer with a person, and the grant that person gave a program for `/mcp`. */
async function granted(t: Parameters<typeof mcpApp>[0]) {
  const app = await mcpApp(t, [], 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  const given = await app.grant({
    user: callerIdOf(ada),
    scopes: ['write'],
    client: 'https://chat.example/client.json',
  })
  return { app, ada, given }
}

/** The moment that the writer last noted a use of the person's one grant. */
const usedAt = async (app: Awaited<ReturnType<typeof granted>>['app'], user: string): Promise<number> => {
  const [one] = Object(await app.as('nobody').call('everyGrantOf', { user }))
  return new Date(String(Object(one).usedAt)).getTime()
}

test('[29-3@9b] an exchange at `/mcp` on a reader is carried out by the writer, and the use of a grant there is noted on the writer', async (t) => {
  const { app, ada, given } = await granted(t)
  const near = await app.reader()
  await current(app, near)
  await level(app, near)
  const before = await usedAt(app, callerIdOf(ada))
  app.clock.advance('2 minutes')
  const added = await near.mcp({ as: { token: given.token } }).call('addOrder', { title: 'From the reader' })
  assert.equal(added.isError, undefined, JSON.stringify(added))
  assert.deepEqual(
    (await app.rows('orders')).map((one) => one.title),
    ['From the reader'],
    'the writer carried the call out',
  )
  await until('the writer noted the use of the grant', async () => (await usedAt(app, callerIdOf(ada))) > before)
})

test('[29-3@9b] a read with the pass of a frame, sent to a reader, is answered: the writer that made the pass reads it', async (t) => {
  const app = await mcpApp(t, [], 'mcpScreened')
  const ada = await app.user({ email: 'ada@example.com' })
  const near = await app.reader()
  await current(app, near)
  const given = await app.grant({ user: callerIdOf(ada), scopes: ['read'], client: 'https://chat.example/client.json' })
  await level(app, near)
  const shown = await near.mcp({ as: { token: given.token } }).call('ordersScreen', {})
  const pass = String(Object(shown._meta)['tent.pass'])
  const answer = await near.request(
    new Request('http://localhost/_t/read/openOrders', {
      method: 'POST',
      headers: { authorization: `Bearer ${pass}`, 'content-type': 'application/json', origin: 'null' },
      body: JSON.stringify({ input: {} }),
    }),
  )
  const read = Object(await answer.json())
  assert.equal(read.ok, true, JSON.stringify(read))
})

test('[29-9@9b] the end of a grant of a program is answered after the far reader confirmed: from then on its token is nobody on every machine', async (t) => {
  const app = await mcpApp(t, [], 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  // A token for the whole app reads a query at `/_t/call/`, which the far reader answers by itself.
  const given = await app.grant({ user: callerIdOf(ada), scopes: ['read'], client: 'reports-app', for: 'app' })
  const far = await app.reader({ far: true })
  await current(app, far)
  await level(app, far)
  const read = async (): Promise<Record<string, unknown>> => {
    const answer = await far.request(
      new Request('http://localhost/_t/call/openOrders', {
        method: 'POST',
        headers: { authorization: `Bearer ${given.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      }),
    )
    return Object(await answer.json())
  }
  assert.equal((await read()).ok, true, 'the token reads on the far reader')
  await app.as(ada).call('endGrant', { id: given.id })
  assert.equal(Object((await read()).error).code, 'T0006', 'the far reader holds the end once it is answered')
})
