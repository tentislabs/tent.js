import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { expectPicture } from '../../../../rig/pictures.ts'

const given = (name: string) => readFileSync(`given/front.${name}.png`)

test('[99-1] the stored picture, written another way, holds', async () => {
  await expectPicture('front', given('same'), { engine: 'chromium', within: 0 })
})

test('[99-2] a picture that differs in one pixel in a hundred holds', async () => {
  await expectPicture('front', given('near'), { engine: 'chromium' })
})

test('[99-3] a pixel whose numbers differ by 8 at most does not differ', async () => {
  await expectPicture('front', given('faint'), { engine: 'chromium', within: 0 })
})

test('[99-4] a wider bound lets more pixels differ', async () => {
  await expectPicture('front', given('far'), { engine: 'chromium', within: 0.02 })
})
