import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { served } from './served.ts'

// The project of the scripts, with one more script that loads alive under a type that the browser does not run, as
// a script that a tool of its own takes up later is written: the browser fetches nothing of it and tells no end.
const project = `import { asset, boolean, project } from 'tentjs'

export const site = project('site', {
  title: 'Site',
  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },
  state: { agreed: { type: boolean(), in: 'device' } },
  head: [
    { script: { src: asset('alive.js'), load: 'alive' } },
    { script: { src: asset('other.js'), load: 'alive', type: 'text/partytown' } },
    { script: { src: asset('idle.js'), load: 'idle' } },
  ],
})
`

test('[32-18] a script that loads idle is added also where a script that loads alive is of a type the browser does not run, in the three browsers', async () => {
  const { address } = await served('scripted', {
    change: (folder) => writeFileSync(join(folder, 'tent.ts'), project),
  })
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      await page.goto(`${address}/`)
      await page.locator('#tent[data-t-alive]').waitFor()
      const added = await page
        .waitForFunction(
          () => {
            const said: unknown = Reflect.get(window, 'ran')
            return Array.isArray(said) && said.includes('idle')
          },
          undefined,
          { timeout: 10_000 },
        )
        .then(
          () => true,
          () => false,
        )
      const ran = await page.evaluate(() => String(Reflect.get(window, 'ran')))
      assert.ok(added, `in ${engine} the script that loads idle never ran: ${ran}`)
    })
})

test('[32-1] the browsers of the tests keep a zone other than the zone of the project of the form, so a moment read in the zone of the page is told from one read in the zone of the project', async () => {
  const written = readFileSync(join(import.meta.dirname, 'formed', 'tent.ts'), 'utf8')
  const zone = /zone: '([^']+)'/.exec(written)?.[1]
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const own = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
      assert.notEqual(own, zone, `in ${engine} the page keeps the zone of the project`)
    })
})
