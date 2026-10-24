import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { buildSaved } from '../../build/index.ts'
import type { Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'

// A version of a session of development is the list of its files: the engine runs it from that list, as from a
// folder of its own, with no folder of it on the disk.

const engines: Engine[] = []
const folders: string[] = []
after(async () => {
  for (const engine of engines) await engine.close()
  for (const folder of folders) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

// A view that imports a package of the project, whose module the build makes apart, beside the shelf.
const coded = `import { useState } from 'react'
import { screen } from 'tentjs/ui'
import { shout } from 'tiny-shout'

export const codedScreen = screen('codedScreen', {
  path: '/coded',
  access: 'anyone',
  view: () => {
    const [said] = useState('drawn from the list')
    return <span>{shout(said)}</span>
  },
})
`

/** A copy of the shelf with the view and its package, built as a session of development builds it. */
async function listedShelf(): Promise<{ folder: string; list: string; versionId: string }> {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const work = mkdtempSync(join(all, 'listed-'))
  folders.push(work)
  const folder = join(work, 'shelf')
  cpSync(join(import.meta.dirname, 'streamed'), folder, { recursive: true, filter: (from) => !from.includes('.tent') })
  writeFileSync(join(folder, 'screens', 'coded.tsx'), coded)
  const tiny = join(folder, 'node_modules', 'tiny-shout')
  mkdirSync(tiny, { recursive: true })
  writeFileSync(join(tiny, 'package.json'), '{ "name": "tiny-shout", "type": "module", "main": "index.js" }\n')
  writeFileSync(join(tiny, 'index.js'), "export const shout = (words) => words.toUpperCase() + '!'\n")
  const built = await buildSaved(folder)
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  return { folder, list: built.bundleList, versionId: built.versionId }
}

/** The list of a version that a build of a session wrote: the fingerprint of each of its files, by its path. */
const listOf = (list: string): Record<string, string> => JSON.parse(readFileSync(list, 'utf8')).files

/** The whole text of an answer for an address, as a browser that takes HTML is sent it. */
async function pageAt(address: string): Promise<{ status: number; html: string }> {
  const answer = await fetch(address, { headers: { accept: 'text/html' } })
  return { status: answer.status, html: await answer.text() }
}

test('[21-17] a version of a session of development is run from its list: its pages, a view with a package, a heavy query on its thread, and its browser files, with no folder of the version anywhere', async () => {
  const { folder, list, versionId } = await listedShelf()
  const store = join(folder, '.tent', 'build', 'files')
  const engine = createEngine({ port: 0 })
  engines.push(engine)
  const dataFolder = join(folder, '.tent')
  const app = await engine.open(list, { dataFolder, mode: 'development' })
  await app.seed()
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const address = `http://localhost:${port}`
  // The engine keeps the list and the place of the store it names: no copy, and no folder.
  assert.deepEqual(JSON.parse(readFileSync(join(dataFolder, 'versions', `${versionId}.json`), 'utf8')), {
    files: listOf(list),
    store,
  })
  assert.equal(existsSync(join(dataFolder, 'versions', versionId)), false)
  assert.equal(existsSync(join(folder, '.tent', 'build', versionId)), false)
  // A screen with a heavy query, which a query thread answers from the modules of the list.
  const shelf = await pageAt(`${address}/`)
  assert.equal(shelf.status, 200)
  assert.match(shelf.html, /Notes on the shelf: (<!-- -->)?2/)
  assert.match(shelf.html, /Counted to (<!-- -->)?6000000/)
  // A view, and the module of the package it imports, which the build made apart.
  const view = await pageAt(`${address}/coded`)
  assert.equal(view.status, 200)
  assert.ok(view.html.includes('DRAWN FROM THE LIST!'), view.html)
  // Each file that the head names is served with the bytes the list holds of it.
  const named = [...view.html.matchAll(/(?:href|src)="\/_t\/b\/([^"]+)"/g)].map((one) => one[1])
  assert.ok(named.length >= 2, view.html)
  const listed = listOf(list)
  // A module of development is named at its mark, as is each module that it imports, and its source map.
  const unmarked = (text: string): string => text.replace(/\?v=[0-9a-f]{12}(?="|\n)/g, '')
  for (const path of named) {
    const answer = await fetch(`${address}/_t/b/${path}`)
    assert.equal(answer.status, 200, path)
    const print = listed[path.replace(/\?v=[0-9a-f]{12}$/, '')]
    assert.ok(print !== undefined, path)
    const bytes = Buffer.from(await answer.arrayBuffer())
    if (path.includes('?v=')) assert.equal(unmarked(bytes.toString('utf8')), readFileSync(join(store, print), 'utf8'))
    else assert.deepEqual(bytes, readFileSync(join(store, print)), path)
  }
})
