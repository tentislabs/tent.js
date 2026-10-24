import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { expectPicture } from '../../../../rig/pictures.ts'

test('[99-8] a picture that is not stored yet', async () => {
  await expectPicture('fresh', readFileSync('given/front.same.png'), { engine: 'firefox' })
})
