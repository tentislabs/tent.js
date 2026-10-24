import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { alive, complaintsOf, served } from './served.ts'

/** A query that is never live, which a page asks through the door, and a screen whose entry reads a state. */
const asked = {
  'owed.ts': `import { input, query, text } from 'tentjs'
import { items } from './functions'

export const namedOnce = query('namedOnce', {
  access: 'anyone',
  live: false,
  input: { name: text() },
  rows: items.where({ name: input('name') }).first(),
})
`,
  'asked.tsx': `import { screen, read, text, Link } from 'tentjs/ui'
import { namedOnce } from './owed'

export const askedScreen = screen('askedScreen', {
  path: '/asked',
  access: 'anyone',
  state: { who: text({ optional: true }) },
  data: ({ state }) => ({ one: read(namedOnce, { name: state.who }) }),
  view: ({ one }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span id="shown">{one ? one.name : 'none'}</span>
      <Link set={{ who: 'Saw' }} id="toSaw">Saw</Link>
      <Link set={{ who: 'Kite' }} id="toKite">Kite</Link>
    </div>
  ),
})
`,
}

for (const engine of browserEngines)
  test(`[31-8] an entry whose input reads a state is not asked while a required value is missing, is asked again when the state changes, and of two askings the later answer stands, in ${engine}`, async () => {
    const { address } = await served('stated', {
      change: (folder) => {
        for (const [file, text] of Object.entries(asked)) writeFileSync(join(folder, file), text)
      },
    })
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const reads: string[] = []
      let first = true
      // The answer of the first asking comes after that of the second.
      await page.route('**/_t/read/namedOnce', async (route) => {
        reads.push(String(route.request().postData()))
        if (first) {
          first = false
          await new Promise((done) => setTimeout(done, 1000))
        }
        await route.continue()
      })
      await alive(page, `${address}/asked`)
      const shown = page.locator('[id="shown"]')
      assert.equal(await shown.textContent(), 'none')
      await page.waitForTimeout(300)
      assert.deepEqual(reads, [])
      await page.locator('[id="toSaw"]').click()
      await page.locator('[id="toKite"]').click()
      await page.waitForFunction(() => document.querySelector('[id="shown"]')?.textContent === 'Kite')
      // The answer of the first asking arrives last, and changes nothing.
      await page.waitForTimeout(1500)
      assert.equal(await shown.textContent(), 'Kite')
      assert.equal(reads.length, 2)
      assert.match(reads[0], /Saw/)
      assert.match(reads[1], /Kite/)
      assert.deepEqual(said, [])
    })
  })
