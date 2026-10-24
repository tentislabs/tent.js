import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from 'tentjs/test'

for (const engine of ['chromium', 'firefox', 'webkit'] as const)
  test(`the home screen in ${engine}`, async () => {
    const app = await testApp()
    const page = await app.open('/', { engine })
    assert.equal((await page.text('Hello')).text, 'Hello')
    await app.close()
  })
