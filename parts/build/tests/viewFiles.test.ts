import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject, buildSaved } from '../index.ts'
import { listedFolder } from './listed.ts'

// In development the views are served unbundled, as Vite serves them: each file of the project that a view reaches
// is a module of its own, transformed alone and kept by its text, and a save transforms the saved file alone.

/** A screen of its own address, which imports what `imports` names and says what `said` gives. */
const screenFile = (name: string, imports: string, said: string): string =>
  [
    "import { useState } from 'react'",
    "import { screen } from 'tentjs/ui'",
    imports,
    '',
    `export const ${name}Screen = screen('${name}Screen', {`,
    `  path: '/${name}',`,
    "  access: 'anyone',",
    '  view: () => {',
    `    const [said] = useState(${said})`,
    '    return <span>{said}</span>',
    '  },',
    '})',
    '',
  ].join('\n')

const files: Record<string, string> = {
  'tent.ts': "import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n",
  'shared.ts': "export const greeting = (who: string): string => 'Hello, ' + who\n",
  'screens/one.tsx': screenFile('one', "import { greeting } from '../shared'", "greeting('one')"),
  'screens/two.tsx': screenFile('two', "import { greeting } from '../shared'", "greeting('two')"),
  'screens/alone.tsx': screenFile('alone', '', "'alone first'"),
  // A plugin of the project that writes down each file of the project that the builder transforms.
  'vite.config.ts': `import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export default {
  plugins: [
    {
      name: 'counted',
      transform(_code: string, id: string) {
        if (/[\\\\/](screens|shared)/.test(id) && !id.includes('node_modules'))
          appendFileSync(join(import.meta.dirname, 'transformed.log'), id.replaceAll('\\\\', '/') + '\\n')
        return null
      },
    },
  ],
}
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

/** Saves a file of the project with one text in the place of another. */
function save(folder: string, file: string, from: string, to: string): void {
  const held = readFileSync(join(folder, file), 'utf8')
  assert.ok(held.includes(from), `${file} holds ${from}`)
  writeFileSync(join(folder, file), held.replace(from, to))
}

/** The files of the project that the builder transformed since the last asking, each by its path, in order. */
function transformedOf(folder: string): () => string[] {
  const log = join(folder, 'transformed.log')
  return () => {
    const read = existsSync(log) ? readFileSync(log, 'utf8') : ''
    rmSync(log, { force: true })
    return read
      .split('\n')
      .filter(Boolean)
      .map((one) => one.slice(one.lastIndexOf(folder.replaceAll('\\', '/')) + folder.length + 1))
      .sort()
  }
}

test('[31-21] in development each file of the project that a view reaches is a module of its own, and a save transforms the saved file alone', async (t) => {
  const folder = projectIn(t, 'viewFiles')
  const transformed = transformedOf(folder)
  const first = await buildSaved(folder)
  assert.deepEqual(
    first.findings.filter((one) => one.level === 'error'),
    [],
  )
  transformed()
  const laid = listedFolder(first.bundleList)
  const browser = readdirSync(join(laid, 'browser'))
  // Each file is a module of its own, named by its path, and a view's module imports the screen's file.
  const fileOf = (path: string): string => {
    const found = browser.find((one) => one.startsWith(`src.${path}.`) && one.endsWith('.js') && !one.endsWith('.map'))
    assert.ok(found, `${path} in ${browser.join(', ')}`)
    return String(found)
  }
  const shared = fileOf('shared.ts')
  for (const name of ['one', 'two']) {
    assert.ok(readFileSync(join(laid, 'browser', fileOf(`screens.${name}.tsx`)), 'utf8').includes(`./${shared}`), name)
    const view = browser.find((one) => one.startsWith(`screens.${name}.`) && one.endsWith('.js'))
    assert.ok(readFileSync(join(laid, 'browser', String(view)), 'utf8').includes(`./${fileOf(`screens.${name}.tsx`)}`))
  }
  // A save of a screen transforms that file alone, once for each side it is made for: the server and the browser.
  save(folder, 'screens/alone.tsx', 'alone first', 'alone saved')
  await buildSaved(folder)
  assert.deepEqual(transformed(), ['screens/alone.tsx', 'screens/alone.tsx'])
  // A save of the file that two screens share transforms it alone, at the address it had: the two screens' files,
  // which name it there, are neither transformed nor written again.
  const before = listedFolder(first.bundleList)
  save(folder, 'shared.ts', 'Hello', 'Hi')
  const saved = await buildSaved(folder)
  assert.deepEqual(transformed(), ['shared.ts', 'shared.ts'])
  const now = listedFolder(saved.bundleList)
  const text = (bundle: string, file: string): string => readFileSync(join(bundle, 'browser', file), 'utf8')
  assert.ok(readdirSync(join(now, 'browser')).includes(shared))
  assert.notEqual(text(now, shared), text(before, shared))
  for (const name of ['one', 'two'])
    assert.equal(text(now, fileOf(`screens.${name}.tsx`)), text(before, fileOf(`screens.${name}.tsx`)))
})

test('[31-21] the bundling of the views of development is gone: no view of development holds a file of the project, and no module is shared between views', async (t) => {
  const folder = projectIn(t, 'viewFilesGone')
  const made = await buildSaved(folder)
  const browser = readdirSync(join(listedFolder(made.bundleList), 'browser'))
  assert.deepEqual(
    browser.filter((one) => one.startsWith('shared.')),
    [],
  )
  assert.equal(existsSync(join(import.meta.dirname, '..', 'viewGroups.ts')), false, 'the groups of views are gone')
  // A release holds every view built together, with no file of its own for a file of the project, as before.
  const release = await buildProject(folder, { for: 'release' })
  const shipped = readdirSync(join(release.bundleFolder, 'browser'))
  assert.deepEqual(
    shipped.filter((one) => one.startsWith('src.')),
    [],
  )
  assert.equal(shipped.filter((one) => one.startsWith('shared.') && one.endsWith('.js')).length, 1)
})

test('[31-21] in development a save that adds a screen to a screen file that is run gives the new screen: what a module takes of the files it imports is held with it', async (t) => {
  const folder = projectIn(t, 'view-files-added')
  const first = await buildSaved(folder)
  assert.deepEqual(
    first.findings.filter((one) => one.level === 'error'),
    [],
  )
  // The screen is added below the one the file holds, with the imports that file has already.
  const file = join(folder, 'screens', 'alone.tsx')
  const later = screenFile('later', '', "'later first'").split('\n').slice(4).join('\n')
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n${later}`)
  const saved = await buildSaved(folder)
  assert.deepEqual(
    saved.findings.filter((one) => one.level === 'error'),
    [],
  )
  const screens = Object.keys(Object(saved.description).screens)
  assert.ok(screens.includes('laterScreen'), screens.join(', '))
})
