import { writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { browsed } from '../../index.ts'
import { startedBrowsers } from '../../shot/driven.ts'
import { running } from '../apps.ts'

// A test file of its own program, which the tests of the driven browser start: it opens two pages in Chromium,
// ends neither, and writes the number of the program of its browser where `TENT_BROWSER_AT` names a file.
test('[99-1] a program that opens two pages and ends neither', async (t) => {
  const { app } = await running(t)
  for (let n = 0; n < 2; n++) await browsed(app, { engine: 'chromium', size: { width: 400, height: 300 }, dark: false })
  writeFileSync(String(process.env.TENT_BROWSER_AT), JSON.stringify(startedBrowsers()))
})
