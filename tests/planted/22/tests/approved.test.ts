import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { expectPicture } from '../../../../rig/pictures.ts'

test('[99-1] a stored picture with its own approval', async () => {
  await expectPicture('held', readFileSync('given/held.png'), { engine: 'chromium' })
})
