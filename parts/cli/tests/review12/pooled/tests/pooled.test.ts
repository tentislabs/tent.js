import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { pooledOut } from '../functions/pooledOut'

test('the first test asks the other host', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.equal(await app.as(maya).call(pooledOut, {}), 'one')
  await app.close()
})

test('the second test asks it again on the connection the pool kept', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.equal(await app.as(maya).call(pooledOut, {}), 'one')
  await app.close()
})
