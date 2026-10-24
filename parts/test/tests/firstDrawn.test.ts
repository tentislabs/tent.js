import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// A library of components, laid into the project as a package manager lays one: a badge that marks what it holds.
const library = {
  'package.json': '{ "name": "@acme/ui", "version": "1.0.0", "type": "module", "main": "index.js" }\n',
  'index.js': [
    "import { createElement } from 'react'",
    "export function Badge(props) { return createElement('span', { className: 'badge' }, props.children) }",
    '',
  ].join('\n'),
}

let common: Promise<Served> | undefined
const shop = (): Promise<Served> => {
  common ??= served('firstDrawn', {
    change: (folder) => {
      const lies = join(folder, 'node_modules', '@acme', 'ui')
      mkdirSync(lies, { recursive: true })
      for (const [name, text] of Object.entries(library)) writeFileSync(join(lies, name), text)
    },
  })
  return common
}

// The attributes of HTML that the page and its view may write: every other is an attribute of the framework's own.
const html = new Set([
  'lang',
  'charset',
  'name',
  'content',
  'rel',
  'href',
  'as',
  'crossorigin',
  'type',
  'id',
  'nonce',
  'src',
  'class',
  'async',
  'defer',
  'blocking',
  'fetchpriority',
])
const ours = new Set(['data-t-alive', 'data-t-part', 'data-t-child'])

/** The style files that a document links, by their addresses. */
const linkedStyles = (text: string): string[] =>
  [...text.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map((link) => /\bhref="([^"]+)"/.exec(link[0])?.[1] ?? '')

test('[30-1] a screen of plain elements, a CSS Module, a style file it imports and a component of a package draws its first HTML with its rows and its one style file, and the style file holds the rules of both', async () => {
  const { address } = await shop()
  const first = await (await fetch(`${address}/orders`)).text()
  // The rows are in the first HTML, drawn through the component of the package.
  assert.match(first, /<span class="badge">Ann<\/span>/)
  assert.match(first, /<span class="badge">Bo<\/span>/)
  const styles = linkedStyles(first)
  assert.equal(styles.length, 1, `one style file, the screen's own: ${styles.join(', ')}`)
  const sheet = await (await fetch(new URL(styles[0], address))).text()
  assert.match(sheet, /color:\s*(green|#008000|rgb\(0,\s*128,\s*0\))/, 'the rule of the CSS Module')
  assert.match(sheet, /\.row\b/, 'the rule of the style file')
})

for (const engine of browserEngines)
  test(`[30-1] the screen comes alive with its styles applied and no second request for its rows, and the page holds no attribute of the framework's own but data-t-alive, data-t-part and data-t-child, in ${engine}`, async () => {
    const { address } = await shop()
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const asked: string[] = []
      page.on('request', (request) => asked.push(new URL(request.url()).pathname))
      await alive(page, `${address}/orders`)
      await page.waitForTimeout(300)
      // What the page asked once it was loaded: nothing of the rows it was sent with.
      assert.deepEqual(
        asked.filter((path) => /^\/_t\/(read|screen|call)\b/.test(path)),
        [],
        'no second request for the rows',
      )
      assert.equal(await page.locator('.badge').count(), 2)
      const colors = await page.evaluate(() => ({
        page: getComputedStyle(document.querySelector('#page') ?? document.body).color,
        row: getComputedStyle(document.querySelector('.row') ?? document.body).backgroundColor,
      }))
      assert.deepEqual(colors, { page: 'rgb(0, 128, 0)', row: 'rgb(0, 0, 255)' })
      const names: string[] = await page.evaluate(() => [
        ...new Set([...document.querySelectorAll('*')].flatMap((element) => element.getAttributeNames())),
      ])
      assert.deepEqual(
        names.filter((name) => !html.has(name) && !ours.has(name)),
        [],
        `the attributes of the page: ${names.join(', ')}`,
      )
      assert.deepEqual(said, [])
    })
  })
