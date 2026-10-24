import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject, buildSaved } from '../index.ts'
import { listedFolder, listOf } from './listed.ts'
import { pageCode } from '../pageCode.ts'

// Fast Refresh, the build's side: the transform on each module of development of a file of the project, the view of
// each definition registered as a family, the modules at their addresses with no fingerprint, and the sorting of a
// save into the look alone, which answers the modules that a page takes in place.

const files: Record<string, string> = {
  'tent.ts': "import { project } from 'tentjs'\nexport const shelf = project('shelf', { title: 'Shelf' })\n",
  'functions/notes.ts': [
    "import { query, text } from 'tentjs'",
    '',
    "export const label = query('label', { access: 'anyone', output: text(), run: () => 'Label first' })",
    '',
  ].join('\n'),
  'shared.ts': "export const greeting = (who: string): string => 'Hello, ' + who\n",
  'ui/theme.ts': "export const tone = 'calm'\n",
  'ui/Badge.tsx': [
    "import { tone } from './theme'",
    '',
    'export function Badge(o: { text: string }) {',
    '  return <em data-tone={tone}>{o.text}</em>',
    '}',
    '',
  ].join('\n'),
  'components/card.tsx': [
    "import { useState } from 'react'",
    "import { component } from 'tentjs/ui'",
    '',
    "export const Card = component('Card', {",
    '  view: () => {',
    '    const [n] = useState(1)',
    '    return <b>Card first {n}</b>',
    '  },',
    '})',
    '',
  ].join('\n'),
  'screens/one.tsx': [
    "import { useState } from 'react'",
    "import { screen, read, boolean } from 'tentjs/ui'",
    "import { label } from '../functions/notes'",
    "import { greeting } from '../shared'",
    "import { Badge } from '../ui/Badge'",
    "import { Card } from '../components/card'",
    '',
    "export const oneScreen = screen('oneScreen', {",
    "  path: '/one',",
    "  access: 'anyone',",
    '  data: { label: read(label) },',
    '  view: ({ label }) => {',
    "    const [said] = useState(greeting('one'))",
    '    return (',
    '      <div>',
    '        <h1>One first</h1>',
    '        <span>{said} {label}</span>',
    '        <Badge text="new" />',
    '        <Card />',
    '      </div>',
    '    )',
    '  },',
    '})',
    '',
  ].join('\n'),
  'screens/two.tsx': [
    "import { screen } from 'tentjs/ui'",
    "import { Card } from '../components/card'",
    '',
    "export const twoScreen = screen('twoScreen', { path: '/two', access: 'anyone', view: () => <Card /> })",
    '',
  ].join('\n'),
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

const errorsOf = (built: { findings: { level: string }[] }) => built.findings.filter((one) => one.level === 'error')

test('[31-22] in development a module of a file of the project lies at its address with no fingerprint, and a save writes again the modules whose texts changed and no other: a module that imports a saved one keeps its bytes', async (t) => {
  const folder = projectIn(t, 'refresh-steady')
  const first = await buildSaved(folder)
  assert.deepEqual(errorsOf(first), [])
  const before = listOf(first.bundleList)
  for (const side of ['browser', 'server'])
    for (const path of ['src.screens.one.tsx.js', 'src.screens.two.tsx.js', 'src.components.card.tsx.js'])
      assert.ok(Object.hasOwn(before, `${side}/${path}`), `${side}/${path} in ${Object.keys(before).join(', ')}`)
  // No module of a file of the project carries a fingerprint in its name.
  assert.deepEqual(
    Object.keys(before).filter((path) => /^(browser|server)\/src\..*\.[0-9a-f]{12}\.js$/.test(path)),
    [],
  )
  // A save of the component that two screens import makes its module again, and no module that imports it.
  save(folder, 'components/card.tsx', 'Card first', 'Card saved')
  const saved = await buildSaved(folder)
  assert.deepEqual(errorsOf(saved), [])
  const after = listOf(saved.bundleList)
  const differ = Object.keys(after)
    .filter((path) => after[path] !== before[path] && !path.startsWith('description.') && !path.endsWith('.map'))
    .sort()
  assert.deepEqual(differ, ['browser/src.components.card.tsx.js', 'server/src.components.card.tsx.js'])
})

test('[31-22] a save of the look alone answers the modules that a page takes in place; a save of data, access, path or state, of a backend file, or of a helper that a screen imports and that exports no component answers none; a helper that a file of components alone imports answers that file', async (t) => {
  const folder = projectIn(t, 'refresh-sorted')
  let last = await buildSaved(folder)
  assert.deepEqual(errorsOf(last), [])
  assert.equal(last.swap, undefined, 'a first build swaps nothing')
  /** Saves one file against the version that the build before made, and answers what the build swaps. */
  const swapped = async (file: string, from: string, to: string): Promise<string[] | undefined> => {
    save(folder, file, from, to)
    const next = await buildSaved(folder, { running: last.versionId })
    assert.deepEqual(errorsOf(next), [])
    last = next
    return next.swap
  }
  assert.deepEqual(await swapped('screens/one.tsx', 'One first', 'One saved'), ['browser/src.screens.one.tsx.js'])
  assert.deepEqual(await swapped('components/card.tsx', 'Card first', 'Card saved'), [
    'browser/src.components.card.tsx.js',
  ])
  assert.deepEqual(await swapped('ui/Badge.tsx', 'data-tone', 'data-hue'), ['browser/src.ui.Badge.tsx.js'])
  assert.deepEqual(await swapped('ui/theme.ts', 'calm', 'bright'), ['browser/src.ui.Badge.tsx.js'])
  assert.equal(await swapped('screens/one.tsx', 'data: { label: read(label) },', 'data: {},'), undefined, 'data')
  assert.equal(await swapped('screens/one.tsx', "access: 'anyone'", "access: 'signedIn'"), undefined, 'access')
  assert.equal(await swapped('screens/one.tsx', "path: '/one'", "path: '/first'"), undefined, 'path')
  assert.equal(
    await swapped('screens/one.tsx', "access: 'signedIn',", "access: 'signedIn',\n  state: { open: boolean() },"),
    undefined,
    'state',
  )
  assert.equal(await swapped('functions/notes.ts', 'Label first', 'Label saved'), undefined, 'a backend file')
  assert.equal(await swapped('shared.ts', 'Hello', 'Hi'), undefined, 'a helper that a screen imports')
  // Against a version that the session does not know, nothing is swapped.
  save(folder, 'screens/two.tsx', '<Card />', '<p><Card /></p>')
  assert.equal((await buildSaved(folder, { running: 'no-such-version' })).swap, undefined)
})

test('[31-22] in development each module of a file of the project is made with the transform of Fast Refresh, and the view of each screen and component is registered under its file and its name; a module for the server and a release hold none of it', async (t) => {
  const folder = projectIn(t, 'refresh-transform')
  const built = await buildSaved(folder)
  assert.deepEqual(errorsOf(built), [])
  const laid = listedFolder(built.bundleList)
  const browser = (file: string): string => readFileSync(join(laid, 'browser', file), 'utf8')
  const one = browser('src.screens.one.tsx.js')
  // The transform signs the hooks of a view, and the build registers the view under the place of its file.
  assert.match(one, /\$RefreshSig\$\(\)/)
  assert.match(one, /__tentRefresh\?\.register\(type, "screens\/one\.tsx " \+ id/)
  assert.match(one, /\$RefreshReg\$\(oneScreen\.options\?\.view, "oneScreen\$view"\)/)
  assert.match(one, /__tentRefresh\?\.held\("browser\/src\.screens\.one\.tsx\.js", import\.meta\.url\)/)
  assert.match(browser('src.components.card.tsx.js'), /\$RefreshReg\$\(Card\.options\?\.view, "Card\$view"\)/)
  // A file of React components alone has each registered by the transform itself, as React's own transform does.
  assert.match(browser('src.ui.Badge.tsx.js'), /\$RefreshReg\$\(_c\d*, "Badge"\)/)
  // A module that draws on the server holds nothing of it.
  const server = readFileSync(join(laid, 'server', 'src.screens.one.tsx.js'), 'utf8')
  assert.doesNotMatch(server, /Refresh(Reg|Sig)\$|__tentRefresh/)
  // Nor does any file of a release.
  const release = await buildProject(folder, { for: 'release' })
  const shipped = readdirSync(join(release.bundleFolder, 'browser'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(release.bundleFolder, 'browser', file), 'utf8'))
  for (const text of shipped) assert.doesNotMatch(text, /\$Refresh(Reg|Sig)\$|__tentRefresh/)
})

test('[31-22] the part refresh, with React runtime of Fast Refresh, lies in the development form of the page code alone: the small form and the form for one file hold nothing of it', async () => {
  const { folder, page } = await pageCode()
  assert.equal(typeof page.browserDev.parts.refresh, 'string')
  const refresh = readFileSync(join(folder, page.browserDev.parts.refresh), 'utf8')
  assert.match(refresh, /performReactRefresh/)
  assert.match(refresh, /__tentRefresh/)
  // The part runs before the main file, and takes nothing of it.
  assert.doesNotMatch(refresh, /from ["']\.\/page\./)
  assert.equal(Object.hasOwn(page.browser.parts, 'refresh'), false)
  assert.equal(Object.hasOwn(page.single.parts, 'refresh'), false)
  const small = [
    page.browser.main,
    ...Object.values(page.browser.parts),
    page.single.main,
    ...Object.values(page.single.parts),
  ]
  for (const file of small)
    assert.doesNotMatch(readFileSync(join(folder, file), 'utf8'), /__tentRefresh|performReactRefresh|RefreshSig/, file)
})
