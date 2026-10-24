import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { expectPicture } from '../../../../rig/pictures.ts'

const given = (name: string) => readFileSync(`given/front.${name}.png`)

test('[99-5] a picture that differs in more than one pixel in a hundred', async () => {
  await expectPicture('front', given('far'), { engine: 'chromium' })
})

test('[99-6] a picture of another size differs wholly', async () => {
  await expectPicture('front', given('sized'), { engine: 'chromium', within: 0.99 })
})

test('[99-7] a narrower bound lets fewer pixels differ', async () => {
  await expectPicture('front', given('near'), { engine: 'chromium', within: 0.0099 })
})
