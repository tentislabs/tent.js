import assert from 'node:assert/strict'
import test from 'node:test'
import { browserEngines } from '../../../rig/browser.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

// The runner ends a test that is held past this, whatever holds it, and the test's own closing then ends its browsers.
const held = { timeout: 180_000 }

for (const engine of browserEngines)
  test(
    `[48-2] a step waits for the move it set off to be drawn, so that a link pressed on the screen moved to moves again, in ${engine}`,
    held,
    async (t) => {
      const app = await testApp({ folder: copyOf(t, 'pressedTwice') })
      closing(t, () => app.close())
      const page = await app.open('/a', { engine })
      await page.press('To B')
      assert.equal((await page.text('Screen B')).role, 'heading')
      await page.press('To A')
      assert.equal((await page.text('Screen A')).role, 'heading')
      await page.press('To B')
      assert.equal((await page.text('Screen B')).role, 'heading')
    },
  )
