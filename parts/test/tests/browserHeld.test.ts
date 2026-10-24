import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { testFontFile } from '../../../rig/testFont.ts'
import { openedAlive, counted, held, servedOrigin, shop, shownOrders } from './browsing.ts'

test('[30-6] then written as an arrow goes to a screen with a value of the answer, and does nothing where its goTo is nothing', async () => {
  const origin = await shop()
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await openedAlive(page, `${origin}/follows`)
      const before = await shownOrders(page)
      // The arrow is handed the answer of the call, and here says nothing to go to: the page stays where it is.
      await page.getByRole('button', { name: 'Add and stay' }).click()
      await counted(page, before + 1)
      assert.equal(new URL(page.url()).pathname, '/follows', said)
      // Here it names a screen, with a value that the answer holds: the name of the row that was added.
      await page.getByRole('button', { name: 'Add and open it' }).click()
      await page.waitForURL(`${origin}/rows/Arrowed`)
      await page.getByText('Arrowed all').waitFor()
    })
})

test('[30-6] a failed call is read as calls.<id>.error, and that is nothing again while the next call is under way', async () => {
  const origin = await shop()
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await openedAlive(page, `${origin}/follows`)
      await page.getByRole('button', { name: 'Try' }).click()
      // The call failed: its error is read by the view, under the id of the form.
      const failed = page.getByRole('button', { name: 'T0009' })
      await failed.waitFor()
      // The next call is held back: while it is under way the form is busy, and the error is nothing again.
      const tried = await held(page, 'failing')
      await failed.click()
      const busy = page.getByRole('button', { name: 'Trying' })
      await busy.waitFor()
      assert.equal(await page.getByRole('button', { name: 'T0009' }).count(), 0, said)
      tried.go()
      await page.getByRole('button', { name: 'T0009' }).waitFor()
      assert.equal(tried.calls(), 1, said)
    })
})

test('[31-16] wait: false in a browser: the entry is busy and then not, the view shows the answer when it arrives, and a failure of one is read as calls.<name>.error while the rest of the screen stands', async () => {
  const origin = await shop()
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      // The read of the slow entry is held back, so that the test sees the page while the entry is on its way.
      const slow = await held(page, 'rates', 'read')
      await page.goto(`${origin}/waits`)
      // The first HTML was sent before the entry answered: the screen stands, and says that it is asking.
      await page.getByRole('heading', { name: /\d+ orders/ }).waitFor()
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.getByText('Asking', { exact: true }).waitFor()
      // The other entry failed meanwhile: its error is read by the view, and the rest of the screen stands.
      await page.getByText('Bad T0009').waitFor()
      assert.equal(await page.getByText('Asking', { exact: true }).count(), 1, said)
      assert.equal(await page.getByRole('heading', { name: /\d+ orders/ }).count(), 1, said)
      // The answer arrives: the entry is busy no more, and the view shows what it was answered.
      slow.go()
      await page.getByText('Later 0.9').waitFor()
      assert.equal(await page.getByText('Asking', { exact: true }).count(), 0, said)
      assert.equal(slow.calls(), 1, said)
      assert.equal(new URL(page.url()).pathname, '/waits', said)
    })
})

test('[31-5] a row whose text holds the end of a script and a line separator: the page of a browser still reads its record, comes alive, and shows the text as written', async () => {
  const origin = await servedOrigin()
  // The text sorts before the starter data, so that the first screen shows it.
  const name = `Aa </script><script>window.pwned = 1</script> ${String.fromCharCode(0x2028)} & <b>bold</b>`
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await openedAlive(page, `${origin}/`)
      // The row is added through the door, as a page adds one.
      const added = await page.evaluate(async (text) => {
        const record = JSON.parse(document.getElementById('tent-page')?.textContent ?? '{}')
        const answer = await fetch('/_t/call/addOrder', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: { name: text, total: 1 }, version: record.version }),
        })
        return (await answer.json()).ok
      }, name)
      assert.equal(added, true, said)
      await openedAlive(page, `${origin}/`)
      const seen = await page.evaluate((text) => {
        const shown = [...document.querySelectorAll('#tent span')].map((one) => one.textContent ?? '')
        const record = JSON.parse(document.getElementById('tent-page')?.textContent ?? '{}')
        return {
          // The text stands on the page as it was written, sign for sign, and in the record that the page read.
          shown: shown.includes(text),
          held: JSON.stringify(record.answers).includes(JSON.stringify(text).slice(1, -1)),
          pwned: Reflect.get(window, 'pwned'),
          scripts: document.querySelectorAll('script').length,
          bold: document.querySelectorAll('#tent b').length,
        }
      }, name)
      // Two scripts, the record and the page code: the text made no element, and nothing of it ran.
      assert.deepEqual(seen, { shown: true, held: true, pwned: undefined, scripts: 2, bold: 0 }, said)
    })
})

// What a page shows of a thing that an entry of `unlock` opened.
const opened: Record<string, string> = {
  scripts: 'ran',
  styles: 'read',
  fonts: 'loaded',
  frames: 'shown',
  styleTags: 'styled',
  wasm: 'built',
  blobWorkers: 'worked',
  eval: 'made',
  camera: 'given',
  location: 'given',
  microphone: 'given',
  more: 'shown',
}

// What an engine gives a page of the device whatever the header says, each thing with what the page then shows.
// The header that closes the device is read by Chromium. Firefox does not read it, WebKit does not read it for the
// place, and the WebKit of this driver has no camera and no microphone for a page at all. So of these the header
// is held by its text, and a page shows the rest.
const ofItself: Record<string, Record<string, string>> = {
  chromium: {},
  firefox: { camera: 'given', location: 'given', microphone: 'given' },
  webkit: { camera: 'none', location: 'given', microphone: 'none' },
}

// The smallest picture: one clear point.
const dot = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/** Serves, at another host than the app's, one thing of each kind that a page may ask another host for. */
async function outside(): Promise<{ origin: string; close(): Promise<void> }> {
  const files: Record<string, [kind: string, body: string | Uint8Array]> = {
    '/outside.js': ['text/javascript', 'window.outsideRan = true\n'],
    '/outside.css': ['text/css', '#by-outside { color: rgb(4, 5, 6) }\n'],
    '/outside.woff2': ['font/woff2', readFileSync(testFontFile())],
    '/dot.png': ['image/png', dot],
    '/frame.html': ['text/html', "<!doctype html><script>parent.postMessage('framed', '*')</script>"],
  }
  const server = createServer((request, answer) => {
    const file = files[new URL(request.url ?? '/', 'http://x').pathname]
    if (!file) return void answer.writeHead(404).end()
    answer.writeHead(200, { 'content-type': file[0], 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
    answer.end(file[1])
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const at = server.address()
  const port = typeof at === 'object' && at ? at.port : 0
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((done) => server.close(() => done())),
  }
}

test('[21-11] each entry of unlock opens what its row names and nothing else, shown by a page that needs it: it fails without the entry and works with it', async (t) => {
  const out = await outside()
  t.after(() => out.close())
  const hosts = `['${out.origin}']`
  // Each entry as a project writes it. With none of them, the page is refused every thing.
  const entries: Record<string, string> = {
    none: '',
    scripts: `scripts: ${hosts}`,
    styles: `styles: ${hosts}`,
    fonts: `fonts: ${hosts}`,
    frames: `frames: ${hosts}`,
    styleTags: 'styleTags: true',
    wasm: 'wasm: true',
    blobWorkers: 'blobWorkers: true',
    eval: 'eval: true',
    camera: 'camera: true',
    location: 'location: true',
    microphone: 'microphone: true',
    more: `more: { 'img-src': ${hosts} }`,
  }
  const apps: Record<string, string> = {}
  for (const [name, entry] of Object.entries(entries))
    apps[name] = await servedOrigin((written) => {
      assert.match(written, /unlock: \{[^}]*\},/)
      return written.replace(/unlock: \{[^}]*\},/, `unlock: { ${entry} },`)
    })
  for (const engine of browserEngines) {
    const seen: Record<string, Record<string, string>> = {}
    await inBrowser(
      engine,
      async (page) => {
        for (const [name, origin] of Object.entries(apps)) {
          await openedAlive(page, `${origin}/opened?out=${encodeURIComponent(out.origin)}`)
          const told = page.locator('#seen')
          // The page tries each thing once: the test waits until it has said what came of every one.
          await told
            .filter({
              hasText: new RegExp(
                Object.keys(opened)
                  .map((one) => `(?=.*"${one}")`)
                  .join(''),
              ),
            })
            .waitFor()
          seen[name] = JSON.parse(await told.innerText())
        }
      },
      { device: true },
    )
    const without = seen.none
    // Without its entry each thing is refused, but for what an engine does not hold by the header at all: there
    // the page is given the thing whatever the header says, and the test says so of that engine and that thing.
    for (const thing of Object.keys(opened))
      assert.equal(without[thing], ofItself[engine][thing] ?? 'refused', `${thing} with no entry, in ${engine}`)
    for (const [name, came] of Object.entries(seen)) {
      for (const [thing, what] of Object.entries(came)) {
        const said = `with ${name}, ${thing} in ${engine}`
        // By the standard, what lets text become code lets WebAssembly be built too: `eval` is the widest opening.
        const open = thing === name || (name === 'eval' && thing === 'wasm')
        if (open) assert.equal(what, ofItself[engine][thing] ?? opened[thing], said)
        else assert.equal(what, without[thing], `${said}: an entry opens nothing but its own`)
      }
    }
  }
})
