import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../index.ts'
import { current, send } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** The `name=value` of each cookie that an answer set, as a browser sends them back. */
const cookiesOf = (headers: Headers): string[] => headers.getSetCookie().map((line) => line.split(';')[0])

test('[29-5@7a] a caller who is given a role and then calls a query of another table on the far reader, with the cookie of that answer, is let in', async (t) => {
  tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'many') })
  closing(t, () => app.close())
  const far = await app.reader({ far: true })
  await current(app, far)
  const maya = String((await app.user({ name: 'maya', roles: [] })).user?.id)
  const signed = await send(app, 'signIn', { user: maya })
  assert.equal(signed.status, 200)
  const session = cookiesOf(signed.headers).find((one) => one.includes('tent_session'))
  assert.ok(session)

  // The role is given: its answer waits for the far reader too, and sets the cookie that names what it wrote.
  const given = await send(app, 'giveRole', { user: maya })
  assert.equal(given.status, 200)
  const wrote = cookiesOf(given.headers).find((one) => one.includes('tent_wrote'))
  assert.ok(wrote, 'the answer of the role sets the cookie of what it wrote')
  // The page of maya asks the far reader for a query of another table than the one of the role, with both cookies.
  const asked = await far.request(
    new Request('https://many.test/_t/call/staffCustomers', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${session}; ${wrote}` },
      body: JSON.stringify({ input: {}, as: maya }),
    }),
    { from: '10.9.200.1' },
  )
  assert.equal(asked.status, 200, await asked.text())
})
