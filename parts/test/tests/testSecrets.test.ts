import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

test('[22-14a] in a test app every secret that a definition names has the value test-<NAME>, a secret that the test gives has that value, and any other has none', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'secretive') })
  closing(t, () => app.close())
  const system = app.as('system')
  assert.equal(await system.call('valueOf', { name: 'MAIL_SERVER' }), 'test-MAIL_SERVER')
  // A secret that no definition names, and that the test did not give, has no value.
  await assert.rejects(system.call('valueOf', { name: 'PAY_KEY' }), { code: 'T0019' })

  const given = await testApp({
    folder: copyOf(t, 'secretive'),
    secrets: { PAY_KEY: 'a-key-that-the-test-gave', MAIL_SERVER: 'smtp://user:pass@localhost:2525' },
  })
  closing(t, () => given.close())
  assert.equal(await given.as('system').call('valueOf', { name: 'PAY_KEY' }), 'a-key-that-the-test-gave')
  assert.equal(await given.as('system').call('valueOf', { name: 'MAIL_SERVER' }), 'smtp://user:pass@localhost:2525')
})
