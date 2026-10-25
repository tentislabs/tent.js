import { test } from 'node:test'

test('[99-3] a test that fails at each try', () => {
  throw new Error('it fails each time')
})
