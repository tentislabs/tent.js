import assert from 'node:assert/strict'
import test from 'node:test'
import type { BrowserEngine } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

// The runner ends a test that is held past this, whatever holds it, and the test's own closing then ends its browsers.
const held = { timeout: 180_000 }

// A field of files of the browser's own in both engines that are driven everywhere, and one that `useField` drives.
const cases: { engine: BrowserEngine; path: string; field: string }[] = [
  { engine: 'chromium', path: '/', field: 'a field of the browser' },
  { engine: 'firefox', path: '/', field: 'a field of the browser' },
  { engine: 'chromium', path: '/driven', field: 'a field that useField drives' },
]

for (const { engine, path, field } of cases)
  test(
    `[48-1] page.upload hands ${field} its file, which the form uploads and sends: the row holds it, and the field is empty again, in ${engine}`,
    held,
    async (t) => {
      const app = await testApp({ folder: copyOf(t, 'papered') })
      closing(t, () => app.close())
      const ada = await app.user({ name: 'Ada', roles: [] })
      const page = await app.open(path, { as: ada, engine })
      await page.type('title', 'A paper')
      await page.upload('paper', { name: 'a.txt', bytes: new TextEncoder().encode('hello'), kind: 'text/plain' })
      await page.press('Add')
      const [paper] = await app.rows('papers')
      assert.ok(paper, 'the form added a row')
      assert.equal(paper.title, 'A paper')
      assert.equal(await app.call('paperOf', { id: paper.paper }, { as: ada }), 'a.txt: hello')
      assert.equal((await page.field('paper')).value, '')
    },
  )
