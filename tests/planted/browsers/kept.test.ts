import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { browserEngines, inBrowser, picturesIn } from '../../../rig/browser.ts'

// A test file of its own program, which the tests of the browser rig start: it uses a browser of each engine several
// times, ends with no word of closing them, and writes a picture where `TENT_PICTURE_AT` names a file.
test('[99-1] a program that uses the browsers of the rig several times and closes none', async () => {
  for (const engine of browserEngines)
    for (let n = 0; n < 2; n++) assert.equal(await inBrowser(engine, (page) => page.evaluate(() => 1 + 1)), 2)
  const at = process.env.TENT_PICTURE_AT
  if (at !== undefined)
    for (const engine of browserEngines)
      writeFileSync(
        `${at}.${engine}.png`,
        await picturesIn(engine, (take) => take('<p>Kept</p>', { width: 120, height: 60 })),
      )
})
