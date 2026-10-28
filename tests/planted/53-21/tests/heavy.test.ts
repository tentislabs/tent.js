import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

test('[99-4] a heavy test, which runs in every night [night]', () => {
  appendFileSync(join(import.meta.dirname, '..', 'runs'), 'heavy\n')
})
