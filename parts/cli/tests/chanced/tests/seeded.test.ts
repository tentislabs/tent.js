import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { testApp } from 'tentjs/test'
import { drawn } from '../functions/drawn'

/** What the app's code draws in a test app of a random seed, on a held clock at one moment. */
async function drawnWith(randomSeed: string): Promise<Record<string, unknown>> {
  const app = await testApp({ randomSeed, clock: 'held' })
  app.clock.set('2030-01-01T00:00:00Z')
  const maya = await app.user({ name: 'Maya', roles: [] })
  const got = await app.as(maya).call(drawn, {})
  await app.close()
  return Object(got)
}

test('one random seed draws the same, and another draws otherwise', async () => {
  const [one, again, other] = [await drawnWith('a seed'), await drawnWith('a seed'), await drawnWith('another seed')]
  assert.deepEqual(again, one)
  for (const name of ['random', 'token', 'id', 'math', 'step']) {
    assert.ok(one[name] !== undefined, name)
    assert.notDeepEqual(other[name], one[name], name)
  }
  // What one random seed drew, which the run of another program holds against its own.
  writeFileSync(join(import.meta.dirname, '..', 'drawn.json'), JSON.stringify(one))
})
