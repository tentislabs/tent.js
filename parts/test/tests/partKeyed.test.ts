import assert from 'node:assert/strict'
import test from 'node:test'
import { writeKey } from '../../engine/index.ts'
import { served } from './served.ts'

test('[05-4.23] a key is nobody at /_t/part/, as at the screen it draws for: a key of the role a screen asks is told nothing of its part, and one with the scope screens is drawn it', async () => {
  const { address, app } = await served('parted')
  const first = await (await fetch(`${address}/parted`)).text()
  const version = String(JSON.parse(/id="tent-page">(.*?)<\/script>/s.exec(first)?.[1] ?? '{}').version)
  const asked = (key: string) =>
    fetch(`${address}/_t/part/Notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ props: { heading: 'Staff' }, path: '/staff', version }),
    })
  // A key that may call every function, and holds the role the screen asks.
  const staff = writeKey(app, { roles: ['staff'], scopes: ['*'] }).key
  assert.equal((await asked(staff)).status, 404)
  const reader = writeKey(app, { roles: ['staff'], scopes: ['*', 'screens'] }).key
  assert.equal((await asked(reader)).status, 200)
})
