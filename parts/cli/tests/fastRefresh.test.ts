import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { BrowserEngine, Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { connectionStands } from './standing.ts'
import { copied } from './typed.ts'

// Fast Refresh in `tent dev`, in the three browsers: a save of the look alone is taken in place with what the views
// keep in React, and every other save starts the views anew, as before.

/** The package that the screen imports, as an install lays it into the folder of packages. */
function installed(folder: string, word: string): void {
  const lies = join(folder, 'node_modules', 'tiny-words')
  mkdirSync(lies, { recursive: true })
  writeFileSync(
    join(lies, 'package.json'),
    '{"name":"tiny-words","version":"1.0.0","type":"module","main":"index.js","types":"index.d.ts"}\n',
  )
  writeFileSync(join(lies, 'index.js'), `export const word = ${JSON.stringify(word)}\n`)
  writeFileSync(join(lies, 'index.d.ts'), 'export declare const word: string\n')
}

/** `tent dev` on a copy of the project of these tests, ended when the test ends. */
async function developed(t: TestContext, name: string): Promise<{ dev: Dev; folder: string; origin: string }> {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, name, 'refreshing')
  installed(folder, 'Word first')
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  return { dev, folder, origin: `http://localhost:${dev.port}` }
}

/** Saves a file of the project with one text in the place of another, as an editor does: the whole file is written. */
function save(folder: string, file: string, from: string, to: string): void {
  const held = readFileSync(join(folder, file), 'utf8')
  assert.ok(held.includes(from), `${file} holds ${JSON.stringify(from)}`)
  writeFileSync(join(folder, file), held.replace(from, to))
}

/** What a page asks of the engine from now on: each address it asks for, and each message it sends on its connection. */
function asked(page: Page): { addresses: string[]; sent: string[]; clear(): void } {
  const addresses: string[] = []
  const sent: string[] = []
  page.on('request', (request) => void addresses.push(new URL(request.url()).pathname))
  page.on('websocket', (socket) => socket.on('framesent', (frame) => void sent.push(String(frame.payload))))
  return {
    addresses,
    sent,
    clear: () => {
      addresses.length = 0
      sent.length = 0
    },
  }
}

/** The text of an element of the page. */
const textOf = (page: Page, selector: string): Promise<string> => page.locator(selector).innerText()

/** Waits until an element of the page shows a text. */
const shows = (page: Page, selector: string, text: string): Promise<void> =>
  page.locator(selector, { hasText: text }).first().waitFor({ timeout: 60_000 })

/** Whether the page is the one that was loaded first: a mark that a load of the address takes away. */
const same = (page: Page): Promise<boolean> => page.evaluate(() => Reflect.get(window, 'tentFirst') === true)

for (const engine of browserEngines)
  test(`[31-22] Fast Refresh in ${engine}: a save of a view swaps it in place with what the views keep in React, the address, the typed field and the scroll, and with no screen, entry or watch asked again; a save of a component the same; a changed first value of useState, // @refresh reset and the reset of the mark mount anew; a save that does not build keeps what the views hold, a failure after a swap mounts the screen anew and shows in the overlay; a helper and a backend file start the views anew; a package reloads the page; a module is served with no fingerprint and no-store, and a fresh load draws the new view`, async (t) => {
    const { dev, folder, origin } = await developed(t, `refresh-${engine}`)
    await inBrowser(engine as BrowserEngine, async (page) => {
      const seen = asked(page)
      const stands = connectionStands(page)
      await page.goto(`${origin}/count`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await stands
      await page.evaluate(() => Reflect.set(window, 'tentFirst', true))
      for (let n = 0; n < 3; n++) await page.locator('#add').click()
      await shows(page, '#add', 'Count 3')
      await page.locator('#field').fill('typed')
      await page.locator('#two').click()
      await shows(page, '#tab', 'Tab two')
      await page.locator('#badge').click()
      await shows(page, '#badge', 'Badge first 1')
      await page.evaluate(() => window.scrollTo(0, 400))

      /** A save that the page takes in place: it asks for no screen, reads no entry and watches nothing again. */
      const swapped = async (file: string, from: string, to: string, selector: string, text: string): Promise<void> => {
        seen.clear()
        save(folder, file, from, to)
        await shows(page, selector, text)
        assert.deepEqual(
          seen.addresses.filter((one) => one === '/_t/screen' || one.startsWith('/_t/read/')),
          [],
          `${file}: no screen and no entry is asked again`,
        )
        assert.deepEqual(
          seen.sent.filter((one) => one.includes('"watch"')),
          [],
          `${file}: no watch is sent again`,
        )
        assert.equal(await same(page), true, `${file}: the page is not loaded anew`)
      }
      /** A save that starts the views anew: the page asks for its screen again. */
      const followed = async (
        file: string,
        from: string,
        to: string,
        selector: string,
        text: string,
      ): Promise<void> => {
        seen.clear()
        save(folder, file, from, to)
        await shows(page, selector, text)
        assert.ok(seen.addresses.includes('/_t/screen'), `${file}: the screen is asked for again`)
        assert.equal(await same(page), true, `${file}: the page is not loaded anew`)
      }

      // The view of the screen: what its views keep stays, with the address, the field and the scroll.
      await swapped('screens/count.tsx', 'Title first', 'Title saved', '#title', 'Title saved')
      assert.equal(await textOf(page, '#add'), 'Count 3')
      assert.equal(await page.locator('#field').inputValue(), 'typed')
      assert.equal(await textOf(page, '#tab'), 'Tab two')
      assert.equal(await textOf(page, '#badge'), 'Badge first 1')
      assert.equal(await page.evaluate(() => window.scrollY), 400)
      // A quiet mark says that what the views keep stayed.
      await page.locator('#tent-kept').waitFor()

      // A component's view, the same.
      await swapped('components/badge.tsx', 'Badge first', 'Badge saved', '#badge', 'Badge saved 1')
      assert.equal(await textOf(page, '#add'), 'Count 3')

      // A changed first value of `useState` mounts the view anew, in place.
      await swapped('screens/count.tsx', 'useState(0)', 'useState(5)', '#add', 'Count 5')
      assert.equal(await textOf(page, '#tab'), 'Tab two')

      // The reset of the mark, by its press and by its key, mounts the screen anew: declared state stays.
      await page.locator('#add').click()
      await shows(page, '#add', 'Count 6')
      seen.clear()
      await page.locator('#tent-kept button').click()
      await shows(page, '#add', 'Count 5')
      assert.equal(await textOf(page, '#tab'), 'Tab two')
      await page.locator('#add').click()
      await shows(page, '#add', 'Count 6')
      await page.keyboard.press('Alt+Shift+KeyR')
      await shows(page, '#add', 'Count 5')
      assert.deepEqual(
        seen.addresses.filter((one) => one === '/_t/screen'),
        [],
      )
      assert.equal(await same(page), true)

      // A save that does not build keeps what the views hold, and the save that mends it is taken in place.
      await page.locator('#add').click()
      await shows(page, '#add', 'Count 6')
      save(folder, 'screens/count.tsx', '<h1 id="title">Title saved</h1>', '<h1 id="title">Title saved</h2>')
      await page.locator('#tent-overlay').waitFor()
      assert.equal(await textOf(page, '#add'), 'Count 6')
      await swapped('screens/count.tsx', 'Title saved</h2>', 'Title mended</h1>', '#title', 'Title mended')
      assert.equal(await textOf(page, '#add'), 'Count 6')
      await page.locator('#tent-overlay').waitFor({ state: 'detached', timeout: 60_000 })

      // A failure while drawing after a swap mounts the screen anew with the new code, and shows in the overlay.
      await swapped(
        'screens/count.tsx',
        'const [count, setCount] = useState(5)',
        "const [count, setCount] = useState(5)\n    if (count === 6) throw new Error('Six is no count')",
        '#add',
        'Count 5',
      )
      await page.locator('#tent-overlay', { hasText: 'Six is no count' }).waitFor()
      save(folder, 'screens/count.tsx', "\n    if (count === 6) throw new Error('Six is no count')", '')
      await swapped('screens/count.tsx', 'Title mended', 'Title fine', '#title', 'Title fine')

      // A file that says `// @refresh reset` mounts its views anew at every save.
      await page.locator('#add').click()
      await shows(page, '#add', 'Count 6')
      await swapped(
        'screens/count.tsx',
        "import { useState } from 'react'",
        "// @refresh reset\nimport { useState } from 'react'",
        '#add',
        'Count 5',
      )
      await page.locator('#add').click()
      await shows(page, '#add', 'Count 6')
      await swapped('screens/count.tsx', 'Title fine', 'Title reset', '#add', 'Count 5')

      // A helper that exports no component, and a backend file, start the views anew: declared state stays.
      await page.locator('#add').click()
      await shows(page, '#add', 'Count 6')
      await followed('tone.ts', 'Tone first', 'Tone saved', '#tone', 'Tone saved')
      assert.equal(await textOf(page, '#add'), 'Count 5')
      assert.equal(await textOf(page, '#tab'), 'Tab two')
      await followed('functions/notes.ts', 'Label first', 'Label saved', '#label', 'Label saved')

      // A fresh load after a swap draws the new view; the module of the screen's file is served with no fingerprint,
      // and kept by no browser.
      seen.clear()
      const standsAgain = connectionStands(page)
      await page.reload()
      await page.locator('#tent[data-t-alive]').waitFor()
      await standsAgain
      assert.equal(await textOf(page, '#title'), 'Title reset')
      const module = await fetch(`${origin}/_t/b/browser/src.screens.count.tsx.js`)
      assert.equal(module.status, 200)
      assert.equal(module.headers.get('cache-control'), 'no-store')

      // A file under `node_modules` that changes makes the page load its address anew.
      await page.evaluate(() => Reflect.set(window, 'tentFirst', true))
      const loaded = page.waitForEvent('load', { timeout: 60_000 })
      installed(folder, 'Word saved')
      await loaded
      await page.locator('#tent[data-t-alive]').waitFor()
      assert.equal(await same(page), false)
    })
    assert.equal(dev.findings().filter((one) => one.level === 'error').length, 0)
  })
