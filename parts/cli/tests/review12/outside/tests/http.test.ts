import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { httpOut } from '../functions/httpOut'

test('a function whose code asks another host by node:http', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.equal(await app.as(maya).call(httpOut, {}), '200')
  await app.close()
})
