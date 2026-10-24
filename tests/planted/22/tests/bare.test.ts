import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { expectPicture } from '../../../../rig/pictures.ts'

test('[99-2] a stored picture with no approval', async () => {
  await expectPicture('bare', readFileSync('given/held.png'), { engine: 'chromium' })
})
