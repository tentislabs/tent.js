import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { complaintsOf, served } from './served.ts'

// The project of the shelf is built and served once for the tests of this file: none of them writes a row.
let common: Promise<Served> | undefined
const shelf = (): Promise<Served> => {
  common ??= served('streamed')
  return common
}

/** What a browser is sent for an address, piece by piece as it arrives: each piece as text, and the status. */
async function piecesOf(address: string): Promise<{ status: number; pieces: string[]; headers: Headers }> {
  const answer = await fetch(address, { headers: { accept: 'text/html' } })
  const reader = answer.body?.getReader()
  assert.ok(reader)
  const pieces: string[] = []
  const words = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pieces.push(words.decode(value, { stream: true }))
  }
  return { status: answer.status, pieces, headers: answer.headers }
}

/**
 * The first HTML of a page that came in pieces: its head, which is sent first, and its body up to the page record,
 * which leave before any streamed part.
 */
function firstOf(pieces: string[]): string {
  const at = pieces.findIndex((piece) => piece.includes('id="tent-page"'))
  assert.ok(at >= 0, 'the pieces hold the page record')
  return pieces.slice(0, at + 1).join('')
}

/** The text that a document shows, without its tags: what a reader of the page sees, in the order it stands. */
const shownText = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<template[\s\S]*?<\/template>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

test('[31-20] a slow entry of a component is streamed: the first HTML holds the quick entry and the loading component in its place, and the part with its answer comes in the same answer', async () => {
  const { address } = await shelf()
  const { status, pieces } = await piecesOf(`${address}/`)
  assert.equal(status, 200)
  assert.ok(pieces.length >= 2, `the page came in ${pieces.length} pieces`)
  // The first HTML is the document up to its streamed parts: the quick entry drawn, and the loading component in the
  // place of the part that waits.
  const first = firstOf(pieces)
  assert.match(first, /^<!doctype html>/)
  assert.ok(shownText(first).includes('Notes on the shelf: 2'), first)
  assert.ok(shownText(first).includes('Counting still'), first)
  assert.ok(shownText(first).includes('Below the count'), first)
  assert.ok(!first.includes('Counted to'), 'the first HTML holds nothing of the slow entry')
  assert.ok(!first.includes('</html>'), 'the answer stays open')
  // The rest holds the part, its answer and the line of script that puts it in its place, and ends the document.
  const whole = pieces.join('')
  assert.match(whole, /Counted to (<!-- -->)?6000000/)
  assert.match(whole, /"what":"slowCount","input":{"upTo":6000000},"entry":"count","of":"SlowCount","value":6000000/)
  assert.match(whole, /<script nonce="[^"]+">/)
  assert.match(whole, /<\/html>\n$/)
})

test('[31-20] a page asked for with no Accept of HTML is drawn whole and sent at once', async () => {
  const { app } = await shelf()
  const page = await app.page('/')
  assert.equal(page.status, 200)
  assert.match(page.html, /Counted to (<!-- -->)?6000000/)
  assert.ok(!page.html.includes('Counting still'))
  assert.ok(!/data-t-wait|data-t-part/.test(page.html), 'nothing of a streamed part stands in it')
})

test('[31-20] a needed entry is waited for, never streamed: a missing note still answers 404, and one that is there is drawn with it', async () => {
  const { address } = await shelf()
  const missing = await piecesOf(`${address}/notes/Nobody`)
  assert.equal(missing.status, 404)
  const found = await piecesOf(`${address}/notes/Ann`)
  assert.equal(found.status, 200)
  assert.ok(shownText(firstOf(found.pieces)).includes('The note Ann'), firstOf(found.pieces))
  assert.match(found.pieces.join(''), /Counted to (<!-- -->)?6000000/)
})

test('[31-20] a streamed entry that fails draws the error of its part, and the rest of the page stands with its status', async () => {
  const { address } = await shelf()
  const { status, pieces } = await piecesOf(`${address}/failing`)
  assert.equal(status, 200)
  assert.ok(shownText(firstOf(pieces)).includes('Counting still'))
  const whole = pieces.join('')
  assert.ok(shownText(whole).includes('The count failed with not-counted'), whole)
  assert.ok(shownText(whole).includes('Notes on the shelf: 2'))
  assert.ok(shownText(whole).includes('Below the count'))
})

test('[31-20] an exported page and a cached public one are drawn whole', async () => {
  const { address, app, dataFolder } = await shelf()
  // The public screen is sent whole, to a stranger and from the cache alike.
  for (const time of ['drawn', 'kept']) {
    const { status, pieces } = await piecesOf(`${address}/public`)
    assert.equal(status, 200, time)
    const whole = pieces.join('')
    assert.match(whole, /Counted to (<!-- -->)?6000000/, time)
    assert.ok(!/data-t-wait|data-t-part|Counting still/.test(whole), time)
  }
  const folder = mkdtempSync(join(dataFolder, 'site-'))
  await app.export(folder)
  const exported = readFileSync(join(folder, 'index.html'), 'utf8')
  assert.match(exported, /Counted to (<!-- -->)?6000000/)
  assert.ok(!/data-t-wait|data-t-part|Counting still/.test(exported))
})

test('[31-20] in a browser the slow part is in its place before the page code has loaded, and the page comes alive with its answer', async () => {
  const { address } = await shelf()
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const complaints = complaintsOf(page)
      // The main file of the page code is held back until the test has looked: so what it sees, the HTML did alone.
      const waiting: (() => void)[] = []
      let free = false
      await page.route('**/_t/b/browser/page.*.js', async (route) => {
        if (!free) await new Promise<void>((done) => waiting.push(done))
        await route.continue()
      })
      const read: string[] = []
      page.on('request', (request) => {
        if (request.url().includes('/_t/read/')) read.push(request.url())
      })
      await page.goto(`${address}/`, { waitUntil: 'commit' })
      const main = page.locator('#tent main')
      await main.getByText(/Counted to 6000000/).waitFor()
      // The part stands where the loading component stood: between the quick entry and what follows it.
      const words = await main.innerText()
      assert.match(words, /Notes on the shelf: 2[\s\S]*Counted to 6000000[\s\S]*Below the count/, said)
      assert.ok(!words.includes('Counting still'), said)
      assert.equal(await page.locator('#tent[data-t-alive]').count(), 0, said)
      assert.equal(await page.locator('[data-t-part], template[data-t-wait]').count(), 0, said)
      free = true
      for (const done of waiting.splice(0)) done()
      await page.locator('#tent[data-t-alive]').waitFor()
      // The page took the streamed answer as one of the first HTML: it asks nothing again, and draws the same.
      assert.match(await main.innerText(), /Counted to 6000000/, said)
      assert.deepEqual(read, [], said)
      assert.deepEqual(complaints, [], said)
    })
})

test('[31-20] with scripts off a streamed part shows at the end of the page, and the loading component stays in its place', async () => {
  const { address } = await shelf()
  for (const engine of browserEngines)
    await inBrowser(
      engine,
      async (page) => {
        const said = `in ${engine}`
        await page.goto(`${address}/`)
        const body = await page.locator('body').innerText()
        assert.match(
          body,
          /Notes on the shelf: 2[\s\S]*Counting still[\s\S]*Below the count[\s\S]*Counted to 6000000/,
          said,
        )
      },
      { scripts: false },
    )
})
