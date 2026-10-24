import { test } from 'node:test'
import { built } from './gone.ts'

test('[99-2] a marked test of a file that cannot be loaded', { todo: true }, () => {
  built()
})
