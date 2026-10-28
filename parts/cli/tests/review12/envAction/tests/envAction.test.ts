import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { envAction } from '../functions/envAction'

test('a word of the environment the code of an action reads', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.equal(await app.as(maya).call(envAction, {}), 'one')
  await app.close()
})
