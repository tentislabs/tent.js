import { test } from 'node:test'
import { held } from './some-shared.ts'

test('[99-1] a test of the rigs', () => {
  held()
})
