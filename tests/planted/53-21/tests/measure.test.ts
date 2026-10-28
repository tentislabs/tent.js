import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { measure } from '../../../../rig/budgets.ts'

test('[99-3] a measure, which is taken anew in every run', async () => {
  appendFileSync(join(import.meta.dirname, '..', 'runs'), 'measure\n')
  await measure('no.bar', () => 1, { unit: 'bytes' })
})
