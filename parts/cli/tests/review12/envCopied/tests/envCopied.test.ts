import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { envCopied } from '../functions/envCopied'

test('a word of the environment the code of a function reads from a copy of it', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.equal(await app.as(maya).call(envCopied, {}), 'one')
  await app.close()
})
