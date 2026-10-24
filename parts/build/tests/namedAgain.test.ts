import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MadeView } from '../borrowed/vite.ts'
import { namedViews } from '../viewModules.ts'

// A save names again only what it changed: a module of development that the build before made and that imports what
// it imported then keeps its name and its very bytes, so no fingerprint of it is taken again.

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/** A module the builder made, with what it imports. */
const madeOf = (name: string, text: string, imports: string[] = []): MadeView => ({
  name,
  bytes: encode(text),
  imports,
  module: name,
  map: '{"version":3,"sources":[],"mappings":""}',
})

test('[31-21] after a save, a module of development that the save did not reach keeps the name and the bytes it was given, one that imports a module named anew is named anew, and the names are those that a build which keeps nothing gives', () => {
  const view = madeOf('view.js', 'import "./part.js"\nexport default 1\n', ['part.js'])
  const part = madeOf('part.js', 'export const part = 1\n')
  const alone = madeOf('alone.js', 'export const alone = 1\n')
  const first = namedViews([alone, part, view], 'browser')
  // The save changes the part: the builder makes it anew, and hands the other two as they were kept.
  const saved = madeOf('part.js', 'export const part = 2\n')
  const next = namedViews([alone, saved, view], 'browser')
  assert.equal(next.get('alone.js'), first.get('alone.js'), 'a module the save did not reach is the same file')
  assert.notEqual(next.get('part.js')?.name, first.get('part.js')?.name)
  assert.notEqual(next.get('view.js')?.name, first.get('view.js')?.name, 'a module that imports it is named anew')
  // What is named is what a build that keeps nothing names, byte for byte.
  const fresh = namedViews(
    [
      madeOf('alone.js', 'export const alone = 1\n'),
      madeOf('part.js', 'export const part = 2\n'),
      madeOf('view.js', 'import "./part.js"\nexport default 1\n', ['part.js']),
    ],
    'browser',
  )
  for (const file of ['alone.js', 'part.js', 'view.js']) {
    assert.equal(next.get(file)?.name, fresh.get(file)?.name, file)
    assert.deepEqual(next.get(file)?.bytes, fresh.get(file)?.bytes, file)
  }
  assert.match(
    new TextDecoder().decode(next.get('view.js')?.bytes),
    new RegExp(String(next.get('part.js')?.name.slice(8))),
  )
})
