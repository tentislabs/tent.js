import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { envWord } from '../functions/envWord'

test('a word of the environment the code of a function reads', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.equal(await app.as(maya).call(envWord, {}), 'one')
  await app.close()
})
