import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { testApp } from '../../test/index.ts'
import { root, typed } from './typed.ts'

test('[15-4@5] the screen of a new project is a view of plain elements, and shows what its query answers in its first HTML', async (t) => {
  const folder = join(root, 'results', 'cli', 'sample-screen')
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  mkdirSync(folder, { recursive: true })
  t.after(remove)
  assert.equal((await typed(folder, 'new', 'my-app')).ended, 0)
  const project = join(folder, 'my-app')
  // The screen is written as the docs show one.
  const written = readFileSync(join(project, 'screens', 'home.tsx'), 'utf8')
  assert.match(written, /^import \{ [^}]+ \} from 'tentjs\/ui'\n/)
  assert.match(written, /export const homeScreen = screen\('homeScreen', \{\n {2}path: '\/',/)
  assert.match(written, /^import \{ greeting \} from '\.\.\/functions\/greeting'$/m)
  assert.match(written, /data: \{ greeting: read\(greeting\) \}/)

  const app = await testApp({ folder: project })
  t.after(() => app.close())
  const page = await app.as('nobody').page('/')
  assert.equal(page.status, 200)
  assert.match(page.html, /<title>My App<\/title>/)
  // What the query answers is drawn in the first HTML, before the page record.
  const answer = String(await app.as('nobody').call('greeting'))
  assert.ok(page.html.split('<script type="application/json"')[0].includes(`>${answer}<`), page.html)
  const checked = await typed(project, 'check', '--json')
  assert.equal(checked.ended, 0, checked.printed)
  const value = JSON.parse(checked.printed).value
  assert.deepEqual([value.definitions.homeScreen, value.definitions.greeting], ['code', 'plain'])
  assert.deepEqual(value.why, {})
})
