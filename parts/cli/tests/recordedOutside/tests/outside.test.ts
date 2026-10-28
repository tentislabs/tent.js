import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { testApp } from 'tentjs/test'
import { fetchHere, paint } from '../functions/outside'

test('a test that fails', () => {
  assert.equal(1 + 1, 3)
})

test('a plain fetch leaves the program', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.equal(await app.as(maya).call(fetchHere, {}), 'refused')
  await app.close()
})

test('a model that no test faked', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.equal(await app.as(maya).call(paint, {}), 'a picture')
  await app.close()
})

test('a file read through node:fs', () => {
  assert.match(readFileSync(new URL(import.meta.url), 'utf8'), /node:fs/)
})
