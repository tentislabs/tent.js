import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

test('[99-2] a test that passes, and writes each time it runs', () => {
  appendFileSync(join(import.meta.dirname, '..', 'runs'), 'ran\n')
})
