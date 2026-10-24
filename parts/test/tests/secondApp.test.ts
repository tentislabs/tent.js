import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

// The two tests share the program of this file, as the tests of one file of an app do: the second test app is made
// after the first one was closed and its folder removed.

/**
 * A copy of the project of charts, with its package installed: a package whose module of CommonJS asks for React by
 * `require`, as a library of charts does through the packages it uses.
 */
function charted(t: TestContext): string {
  const folder = copyOf(t, 'charted')
  const at = join(folder, 'node_modules', 'tiny-bars')
  mkdirSync(at, { recursive: true })
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'tiny-bars', version: '1.0.0', type: 'module', exports: './index.js' }),
    'index.js': [
      "import react from './react.cjs'",
      '',
      'export function BarLine({ label, value }) {',
      "  return react.createElement('div', { className: 'bar' }, label, react.createElement('span', { style: { width: value } }))",
      '}',
      '',
    ].join('\n'),
    'react.cjs': "module.exports = require('react')\n",
  }
  for (const [name, text] of Object.entries(files)) writeFileSync(join(at, name), text)
  return folder
}

test('[17-1] a first test app of a file draws a screen with no package, and is closed', async (t) => {
  const app = await testApp({ folder: charted(t) })
  closing(t, () => app.close())
  const page = await app.as('nobody').page('/plain')
  assert.equal(page.status, 200)
  assert.match(page.html, /Plain/)
})

test('[17-1] a second test app of the same file draws a screen whose package imports React', async (t) => {
  const app = await testApp({ folder: charted(t) })
  closing(t, () => app.close())
  const page = await app.as('nobody').page('/')
  assert.equal(page.status, 200, page.html)
  assert.match(page.html, /<div class="bar">Bars/)
})
