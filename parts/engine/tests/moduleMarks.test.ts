import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { fingerprintOf } from '../../core/internal.ts'
import { moduleMarkOf } from '../moduleMarks.ts'

test('[31-22] the marks of the modules of development are worked out from the fingerprints of the list of a version: a save reads only the files it changed, and a module that did not change is never read again', () => {
  const folder = join(process.cwd(), 'results', 'engine', `marks-${Math.random().toString(36).slice(2)}`)
  const store = join(folder, 'files')
  mkdirSync(store, { recursive: true })
  try {
    /** Lays bytes into the store under their fingerprint, as a build of development does, and answers the fingerprint. */
    const stored = (text: string): string => {
      const print = fingerprintOf(new TextEncoder().encode(text))
      writeFileSync(join(store, print), text)
      return print
    }
    const screen = stored('import { word } from "./src.word.ts.js";\nexport default word\n')
    const first = stored('export const word = "first"\n')
    const second = stored('export const word = "second"\n')
    /** Writes the list of a version beside its place, with the description it is served by. */
    const version = (name: string, word: string): { bundle: string; description: Description } => {
      const files = { 'browser/src.screen.tsx.js': screen, 'browser/src.word.ts.js': word }
      writeFileSync(join(folder, `${name}.json`), JSON.stringify({ files, store }))
      const description: Description = JSON.parse(
        JSON.stringify({
          app: { dev: true },
          browser: { screens: { oneScreen: ['browser/src.screen.tsx.js'] }, shared: ['browser/src.word.ts.js'] },
        }),
      )
      return { bundle: join(folder, name), description }
    }
    const before = version('one', first)
    const after = version('two', second)
    const marked = moduleMarkOf(before, 'browser/src.screen.tsx.js')
    assert.match(marked, /^[0-9a-f]{12}$/)
    // The module of the screen did not change: what it imports is known by its fingerprint, and it is read no more.
    rmSync(join(store, screen))
    const again = moduleMarkOf(after, 'browser/src.screen.tsx.js')
    assert.notEqual(again, marked, 'a module that imports one that changed is another mark')
    assert.notEqual(moduleMarkOf(after, 'browser/src.word.ts.js'), moduleMarkOf(before, 'browser/src.word.ts.js'))
  } finally {
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
})
