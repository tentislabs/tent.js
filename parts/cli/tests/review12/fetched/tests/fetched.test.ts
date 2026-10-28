import test from 'node:test'
import assert from 'node:assert/strict'

test('a test that makes a plain fetch of its own', async () => {
  const said = await fetch('http://127.0.0.1:9/').then(
    () => 'answered',
    () => 'refused',
  )
  assert.equal(said, 'refused')
})
