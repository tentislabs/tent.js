import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'

test('a page that clears what it keeps for the tab and loads again sends each form it sends', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  const page = await app.open('/noting', { as: maya })
  await page.type('Words', 'first')
  await page.press('Save')
  await page.press('Start over')
  await page.type('Words', 'second')
  await page.press('Save')
  await app.settled()
  const notes = await app.rows('notes')
  assert.deepEqual(notes.map((one) => one.words).sort(), ['first', 'second'])
  await app.close()
})
