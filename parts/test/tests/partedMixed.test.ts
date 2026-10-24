import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import { alive, complaintsOf, served } from './served.ts'

/** Every file under a folder, each with its text. */
function filesUnder(folder: string): [string, string][] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry): [string, string][] =>
    entry.isDirectory()
      ? filesUnder(join(folder, entry.name))
      : [[join(folder, entry.name), readFileSync(join(folder, entry.name), 'latin1')]],
  )
}

// The package that only the part drawn on the server alone imports, installed into the copy of the project.
const louder = {
  'node_modules/tiny-louder/package.json': JSON.stringify({
    name: 'tiny-louder',
    version: '1.0.0',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/tiny-louder/index.js':
    "export const louder = (said) => said + ', louder (The marker of the package only the hidden part imports)'\n",
}

const installed = (folder: string): void => {
  for (const [path, text] of Object.entries(louder)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
}

// What the part drawn on the server alone draws: a text of its view, of a helper of its file, of a module and of
// a package that only it imports.
const drawn = [
  'The marker of the hidden view',
  'The marker beside the hidden part',
  'The marker of the shouting helper',
  'The marker of the package only the hidden part imports',
]

for (const made of ['release', 'dev'] as const)
  test(`[34-1b] a file that holds a component drawn on the server alone and one that lives in the browser: no browser file holds a text of the first, of what its file holds for it alone or of what only it imports, and the second lives, in a ${made} build`, async () => {
    const { address, app, bundleFolder } = await served('mixed', { for: made, change: installed })
    const html = (await app.page('/mixed')).html
    assert.match(html, /data-t-part="Hidden"/)
    for (const marker of drawn) assert.ok(html.includes(marker), `the first page holds ${marker}`)
    const browserFiles = filesUnder(join(bundleFolder, 'browser'))
    for (const [file, text] of browserFiles)
      for (const marker of [...drawn, 'The marker above the hidden part'])
        assert.ok(!text.includes(marker), `${file} holds ${marker}`)
    // The part that lives in the browser is there, so the file was not left out whole.
    assert.ok(browserFiles.some(([, text]) => text.includes('The words of the shown part')))
    await inBrowser('chromium', async (page) => {
      const said = complaintsOf(page)
      await alive(page, `${address}/mixed`)
      await page.locator('[id="shown"]').click()
      await page.waitForFunction(() => document.querySelector('[id="shown"]')?.textContent?.endsWith(' 1'))
      assert.match(String(await page.locator('[id="hidden"]').textContent()), /HELLO!/)
      assert.deepEqual(said, [])
    })
  })
