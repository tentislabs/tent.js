import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { fingerprintOf } from '../../core/internal.ts'
import { buildProject, buildSaved } from '../index.ts'
import { listOf } from './listed.ts'

// A build of a session of development keeps each file once by the fingerprint of its bytes, and a version is the
// list of its files. A release bundle is a folder of files, as before.

const files: Record<string, string> = {
  'tent.ts': `import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n`,
  'functions/notes.ts': `import { anyone, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text() }, access: { read: anyone('every visitor') } })

export const allNotes = query('allNotes', { access: anyone('every visitor'), rows: notes.oldest('body').limit(20) })
`,
  'screens/home.tsx': `import { useState } from 'react'
import { screen, read } from 'tentjs/ui'
import { allNotes } from '../functions/notes'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  data: { all: read(allNotes) },
  view: ({ all }) => {
    const [shown] = useState('Notes')
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span>{shown}</span>
        {all.map((o) => <span key={o.id}>{o.body}</span>)}
      </div>
    )
  },
})
`,
  'screens/about.tsx': `import { screen } from 'tentjs/ui'

export const aboutScreen = screen('aboutScreen', { path: '/about', access: 'anyone', view: () => <span>About the shop</span> })
`,
}

/** Writes the project into a folder of its own, removed when the test ends. */
function projectIn(t: TestContext, name: string): string {
  const folder = join(process.cwd(), 'results', 'build', `${name}-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

/** Every file under a folder, by its path from the folder, written with `/`. */
const filesUnder = (folder: string): string[] =>
  readdirSync(folder, { recursive: true })
    .map((one) => String(one).replaceAll('\\', '/'))
    .filter((one) => statSync(join(folder, one)).isFile())
    .sort()

test('[14-2] a build of a session keeps each file of its version once, by the fingerprint of its bytes, and the version is the list of its files: no folder of them is written', async (t) => {
  const folder = projectIn(t, 'listed')
  const build = join(folder, '.tent', 'build')
  const store = join(build, 'files')
  const first = await buildSaved(folder)
  assert.deepEqual(
    first.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.equal(first.bundleList, join(build, `${first.versionId}.json`))
  assert.equal(existsSync(join(build, first.versionId)), false, 'no folder of the version is written')
  const listed = listOf(first.bundleList)
  // Each file of the version lies in the store under the fingerprint of its bytes, and the store holds nothing else.
  for (const [path, print] of Object.entries(listed))
    assert.equal(fingerprintOf(readFileSync(join(store, print))), print, path)
  assert.deepEqual(filesUnder(store), [...new Set(Object.values(listed))].sort())
  // The list names what the folder of a bundle held: the description, the modules and the page code.
  assert.ok(Object.hasOwn(listed, 'description.json'))
  // A module of development lies at its address with no fingerprint.
  assert.ok(Object.hasOwn(listed, 'browser/screens.about.js'))
  const description = JSON.parse(readFileSync(join(store, String(listed['description.json'])), 'utf8'))
  assert.equal(description.app.name, 'shop')
  // The module of the view, and the server file of the page code, as the description names them.
  assert.ok(Object.hasOwn(listed, description.server.views.homeScreen), description.server.views.homeScreen)
  assert.ok(Object.hasOwn(listed, description.server.screens), description.server.screens)
})

test('[14-2] a save of a screen keeps the files whose bytes changed and writes the list of the new version: no other file of the build is written, and the list of the version before stands', async (t) => {
  const folder = projectIn(t, 'listedSave')
  const build = join(folder, '.tent', 'build')
  const store = join(build, 'files')
  const first = await buildSaved(folder)
  const before = new Map(filesUnder(build).map((one) => [one, statSync(join(build, one)).mtimeMs]))
  const about = join(folder, 'screens', 'about.tsx')
  writeFileSync(about, readFileSync(about, 'utf8').replace('About the shop', 'About this shop'))
  const second = await buildSaved(folder)
  assert.notEqual(second.versionId, first.versionId)
  const was = listOf(first.bundleList)
  const now = listOf(second.bundleList)
  // What the save changed: the modules of the screen on each side, its own and that of its file, their maps, and
  // the description.
  const changed = Object.keys(now)
    .filter((path) => was[path] !== now[path])
    .sort()
  assert.ok(changed.length > 0)
  assert.deepEqual(
    changed.filter(
      (path) => !/^(browser|server)\/(src\.)?screens\.about\./.test(path) && !path.startsWith('description.'),
    ),
    [],
  )
  // The files written are the new fingerprints, each once, and the list of the new version: nothing else.
  const written = filesUnder(build).filter((one) => before.get(one) !== statSync(join(build, one)).mtimeMs)
  assert.deepEqual(
    written,
    [...new Set(changed.map((path) => `files/${now[path]}`)), `${second.versionId}.json`]
      .filter((one) => !before.has(one))
      .sort(),
  )
  assert.ok(existsSync(first.bundleList), 'the list of the version before stands')
  for (const print of Object.values(now)) assert.ok(existsSync(join(store, print)), print)
})

test('[14-2] a release build writes the folder of its bundle as it wrote it before: every file whole in its place, and no list and no store of fingerprints', async (t) => {
  const folder = projectIn(t, 'listedRelease')
  const build = join(folder, '.tent', 'build')
  const made = await buildProject(folder, { for: 'release' })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.equal(made.bundleFolder, join(build, made.versionId))
  assert.ok(statSync(made.bundleFolder).isDirectory())
  const bundle = filesUnder(made.bundleFolder)
  assert.ok(bundle.includes('description.json'))
  assert.ok(bundle.includes('description.schema.json'))
  assert.ok(bundle.some((path) => /^browser\/screens\.about\.[0-9a-f]{12}\.js$/.test(path)))
  // Each file is one of its own, as the build wrote it, and none is a link to a file of another bundle.
  for (const path of bundle) assert.equal(statSync(join(made.bundleFolder, path)).nlink, 1, path)
  assert.deepEqual(readdirSync(build), [made.versionId])
  // A second release build of the same files writes the same folder again.
  const again = await buildProject(folder, { for: 'release' })
  assert.equal(again.bundleFolder, made.bundleFolder)
  assert.deepEqual(filesUnder(again.bundleFolder), bundle)
})
