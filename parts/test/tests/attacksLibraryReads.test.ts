import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../index.ts'
import { keyedApp } from './keyedApp.ts'
import { closing, copyOf } from './projects.ts'

test('[43-7.5] a component of a library cannot read the session cookie: the engine sets it HttpOnly, over http and over https', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'callers') })
  closing(t, () => app.close())
  // Maya is a user of the starter data of the project.
  for (const origin of ['http://localhost', 'https://shop.test']) {
    const answer = await app.request(
      new Request(`${origin}/_t/call/signIn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ input: { email: 'maya@example.com' } }),
      }),
    )
    const set = answer.headers.getSetCookie().filter((line) => /tent_session/.test(line))
    assert.equal(set.length, 1, `${origin}: ${JSON.stringify(answer.headers.getSetCookie())}`)
    // A script of the page, and so every component it draws, reads no cookie that is HttpOnly.
    assert.match(set[0], /; HttpOnly(;|$)/, set[0])
  }
})

test("[43-7.5] a component of a library that asks the engine's addresses for rows, as its screen's caller, gets that caller's rows and no more", async (t) => {
  const app = await keyedApp(t)
  const ada = await app.user({ name: 'Ada' })
  const bob = await app.user({ name: 'Bob' })
  await app.as(ada).call('addOrder', { title: 'The lamp of Ada' })
  await app.as(bob).call('addOrder', { title: 'The chair of Bob', total: 9 })
  // What a component sends from the page is what the page sends: the request of the screen's caller.
  const page = app.browser({ as: ada })
  for (const asked of [await page.call('myOrders', {}), await page.read('myOrders', {})]) {
    assert.equal(asked.ok, true, JSON.stringify(asked))
    assert.deepEqual(asked.value, [{ title: 'The lamp of Ada' }])
  }
  // A query that sums every caller's rows is refused, at each address, as it is for the caller.
  for (const asked of [await page.call('totals', {}), await page.read('totals', {})]) {
    assert.equal(asked.ok, false, JSON.stringify(asked))
    assert.equal(asked.error?.code, 'T3101', JSON.stringify(asked))
  }
  assert.equal(JSON.stringify(await page.call('myOrders', {})).includes('Bob'), false)
})
