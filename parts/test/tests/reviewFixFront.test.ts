import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { alive, served } from './served.ts'
import { sessionIn } from './sessionIn.ts'

// A screen whose view fails, with a state that its address keeps.
const failing = `
export const boomScreen = screen('boomScreen', {
  path: '/boom',
  access: 'anyone',
  state: { tab: { type: text({ default: 'all' }), in: 'address' } },
  view: ({ state }) => {
    throw new Error(\`no tab \${state.tab}\`)
  },
})
`

test('[43-7] [31-4] "Try again" of the built-in error screen leads to the address that failed, as it was asked, as the page of the engine does', async (t) => {
  const folder = copyOf(t, 'papered')
  const screens = join(folder, 'screens.tsx')
  writeFileSync(screens, readFileSync(screens, 'utf8').replace('useField }', 'useField, text }'))
  appendFileSync(screens, failing)
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const answer = await app.as('nobody').page('/boom?tab=paid')
  assert.equal(answer.status, 500)
  assert.match(answer.html, /<a [^>]*>Try again<\/a>/)
  const again = /<a [^>]*href="([^"]*)"[^>]*>Try again<\/a>/.exec(answer.html)?.[1]
  assert.equal(again?.replaceAll('&amp;', '&'), '/boom?tab=paid')
})

test('[32-1] a form whose native field of files is sent while the file it picked still uploads sends the id of that file once it is there', async () => {
  const { app, address } = await served('papered')
  const rows: unknown = await app.write([{ add: 'users', values: { name: 'Ada', roles: [] } }], { as: 'system' })
  const ada = String(Reflect.get(Object(Array.isArray(rows) ? rows[0] : undefined), 'id'))
  await inBrowser('chromium', async (page) => {
    await sessionIn(page, address, app.session(ada))
    // The files door answers a moment late, as over a slow network.
    await page.route('**/_t/files**', async (route) => {
      await new Promise((done) => setTimeout(done, 1500))
      await route.continue()
    })
    await alive(page, `${address}/`)
    await page.locator('input[name="title"]').fill('A paper')
    await page.locator('input[name="paper"]').setInputFiles({
      name: 'a.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    })
    // A person presses as soon as the file is picked.
    await page.getByRole('button', { name: 'Add' }).click()
    const added = async (): Promise<unknown[]> => {
      const got: unknown = await app.read({ from: 'papers' }, { as: 'system' })
      return Array.isArray(got) ? got : []
    }
    for (let tries = 0; tries < 50 && (await added()).length === 0; tries++)
      await new Promise((done) => setTimeout(done, 100))
    const [paper] = await added()
    assert.ok(paper, 'the press added a row')
    assert.equal(typeof Reflect.get(Object(paper), 'paper'), 'string', 'the row holds the file that was picked')
  })
})
