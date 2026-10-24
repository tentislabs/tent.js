import { test } from 'node:test'
import { setTimeout as wait } from 'node:timers/promises'
import { measure } from '../../../../rig/budgets.ts'

test('[99-1] a measure whose run takes longer than the bar of its name', async () => {
  await measure('slow.work', () => wait(30))
})

test('[99-2] a measure that its run answers as a number above the bar of its name', async () => {
  await measure('big.file', () => 250)
})
