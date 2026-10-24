import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import { alive, served } from './served.ts'
import { sessionIn } from './sessionIn.ts'

test('[32-1] a file that the files door refuses for a native field of files is told to the person as the error of the form, and a press sends nothing', async () => {
  // The paper takes three bytes at most, so the door refuses the file the person picks.
  const { app, address } = await served('papered', {
    change: (folder) => {
      const functions = join(folder, 'functions.ts')
      const text = readFileSync(functions, 'utf8')
      writeFileSync(
        functions,
        text.replace(
          'input: { title: text(), paper: file() }',
          'input: { title: text(), paper: file({ maxSize: 3 }) }',
        ),
      )
    },
  })
  const rows: unknown = await app.write([{ add: 'users', values: { name: 'Ada', roles: [] } }], { as: 'system' })
  const ada = String(Reflect.get(Object(Array.isArray(rows) ? rows[0] : undefined), 'id'))
  await inBrowser('chromium', async (page) => {
    await sessionIn(page, address, app.session(ada))
    await alive(page, `${address}/`)
    await page.locator('input[name="title"]').fill('A paper')
    const answered = page.waitForResponse((response) => response.url().includes('/_t/files'))
    await page.locator('input[name="paper"]').setInputFiles({
      name: 'a.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    })
    assert.equal((await answered).status() >= 400, true, 'the files door refused the file')
    const told = page.getByRole('alert')
    await told.waitFor()
    assert.equal(await told.textContent(), 'Something went wrong. Try again.')
    await page.getByRole('button', { name: 'Add' }).click()
    await new Promise((done) => setTimeout(done, 500))
    const added: unknown = await app.read({ from: 'papers' }, { as: 'system' })
    assert.deepEqual(added, [], 'no row was added with no file')
  })
})
