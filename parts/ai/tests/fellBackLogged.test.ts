import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'

test('[26-1] a call that the next model answered leaves a line in the log of each try of the model that failed, with why', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'models') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya' })
  app.fake('writer', {
    reply: () => {
      throw new Error('switched off')
    },
  })
  app.fake('backup', { reply: () => ({ text: 'Hello, Ada.', calls: [] }) })
  assert.equal(await app.as(maya).call('hello', { name: 'Ada' }), 'Hello, Ada.')
  const { errors } = Object(await app.logs())
  const lines: { name: string; message: string }[] = Array.isArray(errors) ? errors : []
  const failed = lines.filter((one) => one.name === 'writer')
  assert.ok(failed.length > 0, `a line of the model that failed: ${JSON.stringify(lines)}`)
  for (const one of failed) assert.match(one.message, /switched off/)
  // The model that answered, and the call, failed nowhere.
  assert.deepEqual(
    lines.filter((one) => one.name !== 'writer'),
    [],
  )
})
