import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { envPackaged } from '../functions/envPackaged'

test('a word of the environment a package reads for the code of a function', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.equal(await app.as(maya).call(envPackaged, {}), 'one')
  await app.close()
})
