import { test } from 'node:test'
import { browsed } from '../../index.ts'
import { running } from '../apps.ts'

// A test file of its own program: a page of Chromium is ended while a command of it still waits for its answer, as
// a step of a test that failed leaves one, and the program is then free to end.
test('[99-1] a page ended while a command of it waits', async (t) => {
  const { app } = await running(t)
  const page = await browsed(app, { engine: 'chromium', size: { width: 400, height: 300 }, dark: false })
  const waiting = page.evaluate('new Promise(() => {})').catch(() => 'ended')
  await page.end()
  await waiting
})
