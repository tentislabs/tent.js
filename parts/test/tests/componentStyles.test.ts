import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

// A package whose own code imports its style file, deeper than its first file, laid in as a package manager lays one.
const fancy = {
  'package.json': '{ "name": "fancy", "version": "1.0.0", "type": "module", "main": "index.js" }\n',
  'index.js': "export { shine } from './lib/shine.js'\nexport const title = 'The marker of the fancy package'\n",
  'lib/shine.js': "import '../fancy.css'\nexport const shine = () => 'fancy'\n",
  'fancy.css': '.fancy {\n  color: rgb(255, 0, 0);\n}\n',
}

// The project of the style files of components is built and served once in each form.
const built = new Map<'release' | 'dev', Promise<Served>>()
const sky = (form: 'release' | 'dev'): Promise<Served> => {
  const held =
    built.get(form) ??
    served('styled', {
      for: form,
      change: (folder) => {
        for (const [name, text] of Object.entries(fancy)) {
          const lies = join(folder, 'node_modules', 'fancy', name)
          mkdirSync(dirname(lies), { recursive: true })
          writeFileSync(lies, text)
        }
      },
    })
  built.set(form, held)
  return held
}

/** The first HTML of an address, with the text of every style file it links, one after another. */
async function pageOf(address: string, path: string): Promise<{ html: string; sheets: string }> {
  const html = await (await fetch(`${address}${path}`)).text()
  const links = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map(
    (link) => /\bhref="([^"]+)"/.exec(link[0])?.[1] ?? '',
  )
  const sheets = await Promise.all(links.map(async (link) => (await fetch(new URL(link, address))).text()))
  return { html, sheets: sheets.join('\n') }
}

/** Every file under a folder, each with its text. */
function filesUnder(folder: string): [string, string][] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry): [string, string][] =>
    entry.isDirectory()
      ? filesUnder(join(folder, entry.name))
      : [[join(folder, entry.name), readFileSync(join(folder, entry.name), 'latin1')]],
  )
}

/** The class that the CSS Module of the component drawn on the server alone gave its words, as the first HTML holds it. */
const moduleClass = (html: string): string => {
  const found = /<p class="note ([^"]+)" id="note">/.exec(html)?.[1]
  assert.ok(found, `the words of the component drawn on the server alone: ${html}`)
  return found
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

for (const form of ['release', 'dev'] as const) {
  test(`[30-1] a component's own style file loads on the pages that draw the component and stands in no other page, in a ${form} build`, async () => {
    const { address } = await sky(form)
    const drawn = await pageOf(address, '/sky')
    assert.match(drawn.html, /<span class="stars">\*\*\*<\/span>/)
    assert.match(drawn.sheets, /\.stars\s*\{/, 'the page that draws the component loads its style file')
    const home = await pageOf(address, '/')
    assert.match(home.html, /id="home"/)
    assert.doesNotMatch(home.sheets, /\.stars\b/, 'the page that does not draw the component loads none of its style')
  })

  test(`[34-1] a page that draws a component drawn on the server alone loads its style files - its own, its CSS Module's and that of a helper only it draws - no other page does, and no browser file holds its code, in a ${form} build`, async () => {
    const { address, bundleFolder } = await sky(form)
    const drawn = await pageOf(address, '/sky')
    const said = moduleClass(drawn.html)
    assert.match(drawn.html, /The marker of the note/)
    assert.match(drawn.sheets, /\.note\s*\{/, 'its own style file')
    assert.match(drawn.sheets, new RegExp(`\\.${escaped(said)}\\s*\\{`), 'the style file of its CSS Module')
    assert.match(drawn.sheets, /\.boxed\s*\{/, 'the style file of the helper that only it draws')
    const home = await pageOf(address, '/')
    for (const rule of [/\.note\b/, new RegExp(`\\.${escaped(said)}\\b`), /\.boxed\b/])
      assert.doesNotMatch(home.sheets, rule, 'the page that does not draw the component loads none of its style')
    for (const [file, text] of filesUnder(join(bundleFolder, 'browser')))
      for (const marker of ['The marker of the note', 'The marker of the box'])
        assert.ok(!text.includes(marker), `${file} holds ${marker}`)
  })

  test(`[34-1] a page that draws a component drawn on the server alone loads the style file that the code of a package only it imports brings, no other page does, and no browser file holds the package's code, in a ${form} build`, async () => {
    const { address, bundleFolder } = await sky(form)
    const drawn = await pageOf(address, '/sky')
    assert.match(drawn.html, /<b class="fancy" id="shine">The marker of the fancy package<\/b>/)
    assert.match(drawn.sheets, /\.fancy\s*\{/, 'the style file of the package')
    const home = await pageOf(address, '/')
    assert.doesNotMatch(home.sheets, /\.fancy\b/, 'the page that does not draw the component loads none of its style')
    for (const [file, text] of filesUnder(join(bundleFolder, 'browser')))
      assert.ok(!text.includes('The marker of the fancy package'), `${file} holds the code of the package`)
  })
}

for (const engine of browserEngines)
  test(`[34-1] a move from a page that draws neither component to one that draws both draws each with its style, the one drawn on the server alone among them, in ${engine}`, async () => {
    const { address } = await sky('release')
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/`)
      await page.locator('[id="toSky"]').click()
      await page.locator('[id="note"]').waitFor()
      const looks = await page.evaluate(() => {
        const of = (selector: string): CSSStyleDeclaration =>
          getComputedStyle(document.querySelector(selector) ?? document.body)
        return {
          stars: of('.stars').color,
          note: of('[id="note"]').color,
          said: of('[id="note"]').borderLeftColor,
          boxed: of('[id="boxed"]').backgroundColor,
        }
      })
      assert.deepEqual(looks, {
        stars: 'rgb(255, 165, 0)',
        note: 'rgb(0, 0, 255)',
        said: 'rgb(128, 0, 128)',
        boxed: 'rgb(0, 128, 0)',
      })
      assert.deepEqual(said, [])
    })
  })
