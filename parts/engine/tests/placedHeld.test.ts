import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fingerprintOf } from '../../core/internal.ts'
import { placedFolder, placedTidied, runFrom } from '../placedFolders.ts'
import { workFolder } from './apps.ts'

test('[21-17] a folder of links that a program runs from is kept while it runs, though no loaded version names it, and is tidied once the program leaves it', (t) => {
  const folder = workFolder(t)
  const store = join(folder, 'build', 'files')
  mkdirSync(store, { recursive: true })
  mkdirSync(join(folder, 'versions'), { recursive: true })
  /** Writes a version of one file, as a list of development. */
  const version = (id: string, text: string): string => {
    const print = fingerprintOf(new TextEncoder().encode(text))
    writeFileSync(join(store, print), text)
    const place = join(folder, 'versions', id)
    writeFileSync(`${place}.json`, JSON.stringify({ files: { 'server.js': print }, store }))
    return place
  }
  const first = version('v1', 'the first')
  const second = version('v2', 'the second')
  const left = placedFolder(first, '')
  const running = placedFolder(second, '')
  assert.notEqual(left, running)
  const release = runFrom(left)
  placedTidied([second])
  assert.ok(existsSync(left), 'the folder a program runs from is kept')
  assert.ok(existsSync(running), 'the folder of the loaded version is kept')
  release()
  assert.equal(existsSync(left), false, 'the folder is tidied once the program left it')
  assert.equal(existsSync(`${left}.whole`), false)
  placedTidied([second])
  assert.ok(existsSync(running))
  // A folder that is laid out again after it was tidied holds its files again.
  assert.equal(placedFolder(first, ''), left)
  assert.ok(existsSync(join(left, 'server.js')))
})
