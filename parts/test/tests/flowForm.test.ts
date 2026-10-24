import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'

test('[23-30a] a `Form` whose `call` is a flow sends its named controls as the `input` of the flow, each of its type, and its `then` is handed the answer of the flow', async (t) => {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const work = mkdtempSync(join(all, 'flow-form-'))
  const engine = createEngine({ port: 0 })
  t.after(async () => {
    await engine.close()
    rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  const folder = join(work, 'project')
  cpSync(join(import.meta.dirname, 'flowForm'), folder, { recursive: true })
  const made = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(made.findings, [])
  const dataFolder = join(work, 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  const origin = `http://localhost:${JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).port}`

  // With no script the form posts to the address of the flow.
  const first = await app.page('/', { as: 'nobody' })
  assert.equal(first.status, 200)
  assert.match(first.html, /<form id="welcome"[^>]*action="\/_t\/form\/welcome" method="post">/)

  for (const browser of browserEngines)
    await inBrowser(browser, async (page) => {
      const said = `in ${browser}`
      await page.goto(`${origin}/`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.locator('#name').fill(`Ada of ${browser}`)
      await page.locator('#guests').fill('2')
      await page.locator('#send').click()
      // The call started a run and waited for it: `then` is handed what the `output` of the flow names.
      await page.getByRole('heading', { name: `Welcome Ada of ${browser}, with 2 guests` }).waitFor()
      const [run] = app.runs.find({ flow: 'welcome', newest: 1 })
      assert.deepEqual(run.input, { name: `Ada of ${browser}`, guests: 2 }, said)
      assert.equal(run.state, 'done', said)
    })
  assert.equal(app.runs.find({ flow: 'welcome' }).length, browserEngines.length, 'one run for each send')
})
