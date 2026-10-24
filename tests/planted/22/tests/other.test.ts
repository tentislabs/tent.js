import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { expectPicture } from '../../../../rig/pictures.ts'

test('[99-3] a stored picture whose approval holds another fingerprint', async () => {
  await expectPicture('other', readFileSync('given/other.png'), { engine: 'chromium' })
})
