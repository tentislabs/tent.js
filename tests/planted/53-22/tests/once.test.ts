import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// The first try leaves a file behind, which a second try would find: there is none.
const tried = join(import.meta.dirname, '..', 'tried')

test('[99-1] a test that fails at its first try, and would pass at a second', () => {
  appendFileSync(join(import.meta.dirname, '..', 'tries'), 'tried\n')
  if (existsSync(tried)) return
  writeFileSync(tried, '')
  throw new Error('the first try fails')
})
