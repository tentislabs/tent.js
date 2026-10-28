import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { stamp } from '../functions/drawn'

const moment = Date.parse('2030-01-01T00:00:00Z')

test('the held clock stands until it is moved, and the code of the app reads it', async () => {
  const app = await testApp({ clock: 'held' })
  const maya = await app.user({ name: 'Maya', roles: [] })
  const first = await app.as(maya).call(stamp, {})
  // Work between two calls takes time on the system's clock, and none on the app's.
  for (let at = Date.now(); Date.now() === at; ) await app.rows('notes')
  assert.equal(await app.as(maya).call(stamp, {}), first)
  app.clock.set('2030-01-01T00:00:00Z')
  assert.equal(await app.as(maya).call(stamp, {}), moment)
  app.clock.advance('1 day')
  assert.equal(await app.as(maya).call(stamp, {}), moment + 86_400_000)
  // The test's own code reads the time of the system.
  assert.ok(Date.now() < moment)
  await app.close()
})
