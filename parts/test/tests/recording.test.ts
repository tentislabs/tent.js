import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { inBrowser } from '../../../rig/browser.ts'
import { alive, served } from './served.ts'

/**
 * Makes the browser give the microphone only after a while, as a person who is asked takes a moment, and keeps
 * every stream it gave, so that a test sees whether each of its tracks was stopped.
 */
async function slowMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const given: MediaStream[] = []
    Reflect.set(window, '__streams', given)
    const asked = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (o) => {
      const stream = await asked(o)
      await new Promise((done) => setTimeout(done, 600))
      given.push(stream)
      return stream
    }
  })
}

/** How many streams the browser gave, and how many of them still have a track that records. */
const streamsOf = (page: Page): Promise<{ given: number; live: number }> =>
  page.evaluate(() => {
    const given: MediaStream[] = Reflect.get(window, '__streams')
    return {
      given: given.length,
      live: given.filter((one) => one.getTracks().some((track) => track.readyState === 'live')).length,
    }
  })

test('[21-10] a second start while the browser is asked begins no second recording, and a cancel ends every track of the microphone', async () => {
  const { address } = await served('recording')
  await inBrowser(
    'chromium',
    async (page) => {
      await slowMicrophone(page)
      await alive(page, `${address}/record`)
      const record = page.getByRole('button', { name: 'Record', exact: true })
      await record.click()
      await record.click()
      await page.getByText('State recording').waitFor()
      await page.waitForTimeout(800)
      assert.deepEqual(await streamsOf(page), { given: 1, live: 1 }, 'one recording')
      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.waitForFunction(() =>
        Reflect.get(window, '__streams').every((one: MediaStream) =>
          one.getTracks().every((track) => track.readyState === 'ended'),
        ),
      )
    },
    { device: true },
  )
})

test('[21-10] a view that leaves while the browser is asked for the microphone ends the recording that the browser then gives', async () => {
  const { address } = await served('recording')
  await inBrowser(
    'chromium',
    async (page) => {
      await slowMicrophone(page)
      await alive(page, `${address}/record`)
      await page.getByRole('button', { name: 'Record', exact: true }).click()
      await page.locator('#away').click()
      await page.getByRole('heading', { name: 'Away' }).waitFor()
      await page.waitForFunction(() => Reflect.get(window, '__streams').length === 1)
      await page.waitForTimeout(300)
      assert.deepEqual(await streamsOf(page), { given: 1, live: 0 })
    },
    { device: true },
  )
})
