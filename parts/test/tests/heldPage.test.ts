import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

// The runner ends a test that is held past this, whatever holds it, and the test's own closing then ends its browsers.
const held = { timeout: 120_000 }

test(
  '[48-2] a step keeps to its time whatever the page holds: a press in an open dialog that leaves the page held by a question of the browser fails with T0008',
  held,
  async (t) => {
    const app = await testApp({ folder: copyOf(t, 'heldPage') })
    closing(t, () => app.close())
    const page = await app.open('/settings')
    assert.equal((await page.text('Settings')).role, 'heading')
    const began = performance.now()
    await assert.rejects(page.press('Save'), (error: unknown) => {
      assert.equal(Reflect.get(Object(error), 'code'), 'T0008', String(error))
      return true
    })
    // Two seconds for the step, and as long again for what the failure keeps of the page.
    const took = performance.now() - began
    assert.ok(took < 15_000, `the step failed after ${Math.round(took)} ms`)
  },
)
