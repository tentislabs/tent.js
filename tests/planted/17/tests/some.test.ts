import { test } from 'node:test'
import { held } from './some-shared.ts'

test('[99-2] a test of the rigs', () => {
  held()
})
