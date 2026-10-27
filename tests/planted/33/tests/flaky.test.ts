import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// The first try leaves a file behind, which the second finds.
const tried = join(import.meta.dirname, '..', 'tried')

test('[99-1] a test that fails at its first try and passes at its second', () => {
  if (existsSync(tried)) return
  writeFileSync(tried, '')
  throw new Error('the first try fails')
})
