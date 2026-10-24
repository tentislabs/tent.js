import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { findPageCode } from '../draw.ts'

// A module of a view names a package built apart by `tent-package:<file>`: the page code answers it with the file
// where it first found it, so the versions of a session that hold the same file load it once.

test('[31-21] two bundles that hold one module of a package by the same name load it once, and a module of another name is another module', async (t) => {
  const root = join(process.cwd(), 'results', 'screens', `packagesOnce-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const lay = (bundle: string, file: string): string => {
    const server = join(root, bundle, 'server')
    mkdirSync(server, { recursive: true })
    writeFileSync(join(server, file), 'export const made = { at: Math.random() }\n')
    writeFileSync(
      join(server, 'view.js'),
      `export { made } from ${JSON.stringify(`tent-package:${file}`)}\nexport const where = import.meta.url\n`,
    )
    findPageCode(server)
    return pathToFileURL(join(server, 'view.js')).href
  }
  const first: { made: object } = await import(lay('one', 'package.tiny.0123456789ab.js'))
  const second: { made: object } = await import(lay('two', 'package.tiny.0123456789ab.js'))
  assert.equal(second.made, first.made)
  const other: { made: object } = await import(lay('three', 'package.tiny.ba9876543210.js'))
  assert.notEqual(other.made, first.made)
})
