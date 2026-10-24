import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildSaved } from '../index.ts'

// A screen whose `data` and `title` are arrows that are not plain: the description holds `{ code: true }` for each.
const files: Record<string, string> = {
  'tent.ts': "import { project } from 'tentjs'\nexport const shelf = project('shelf', { title: 'Shelf' })\n",
  'functions/notes.ts': [
    "import { number, query, text } from 'tentjs'",
    '',
    "export const label = query('label', { access: 'anyone', input: { n: number() }, output: text(), run: ({ n }) => 'Label ' + n })",
    '',
  ].join('\n'),
  'screens/coded.tsx': [
    "import { screen, read } from 'tentjs/ui'",
    "import { label } from '../functions/notes'",
    '',
    'const entries = () => ({ shown: read(label, { n: 1 + 1 }) })',
    "const named = (o: { shown: string }) => ['Coded', o.shown].join(' ')",
    '',
    "export const codedScreen = screen('codedScreen', {",
    "  path: '/coded',",
    "  access: 'anyone',",
    '  data: () => entries(),',
    '  title: named,',
    '  view: ({ shown }) => <p>{shown}</p>,',
    '})',
    '',
  ].join('\n'),
}

/** Writes the project into a folder of its own, removed when the test ends. */
function projectIn(t: TestContext): string {
  const folder = join(process.cwd(), 'results', 'build', `reviewRefresh-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

test('[31-22] a save that changes the data of a screen, written as code, is taken as a switch with no swap, and so is one that changes its title written as code: the record of the screen is more than its view', async (t) => {
  const folder = projectIn(t)
  let last = await buildSaved(folder)
  assert.deepEqual(
    last.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.deepEqual(Object(last.description.screens.codedScreen).data, { code: true }, 'the data is stored as code')
  const swapped = async (from: string, to: string): Promise<string[] | undefined> => {
    const file = join(folder, 'screens/coded.tsx')
    const held = readFileSync(file, 'utf8')
    assert.ok(held.includes(from), from)
    writeFileSync(file, held.replace(from, to))
    const next = await buildSaved(folder, { running: last.versionId })
    assert.deepEqual(
      next.findings.filter((one) => one.level === 'error'),
      [],
    )
    last = next
    return next.swap
  }
  // The view alone: taken in place.
  assert.deepEqual(await swapped('<p>{shown}</p>', '<b>{shown}</b>'), ['browser/src.screens.coded.tsx.js'])
  // The screen asks its query with another input now: the page must ask its data again.
  assert.equal(await swapped('{ n: 1 + 1 }', '{ n: 2 + 2 }'), undefined, 'a save of the data written as code')
  assert.equal(
    await swapped("['Coded', o.shown]", "['Saved', o.shown]"),
    undefined,
    'a save of the title written as code',
  )
})

test('[31-22] a save of a file of components alone that a component drawn on the server alone draws is taken as a switch with no swap: the page asks for what the server draws of it again, as for a save of that component', async (t) => {
  const folder = join(process.cwd(), 'results', 'build', `reviewRefresh-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const project: Record<string, string> = {
    'tent.ts': "import { project } from 'tentjs'\nexport const shelf = project('shelf', { title: 'Shelf' })\n",
    'ui/Fancy.tsx': 'export function Fancy() {\n  return <i>Fancy first</i>\n}\n',
    'components/hidden.tsx': [
      "import { component } from 'tentjs/ui'",
      "import { Fancy } from '../ui/Fancy'",
      '',
      "export const Hidden = component('Hidden', { browser: false, view: () => <p><Fancy /></p> })",
      '',
    ].join('\n'),
    'screens/one.tsx': [
      "import { screen } from 'tentjs/ui'",
      "import { Hidden } from '../components/hidden'",
      "import { Fancy } from '../ui/Fancy'",
      '',
      "export const oneScreen = screen('oneScreen', {",
      "  path: '/one',",
      "  access: 'anyone',",
      '  view: () => (',
      '    <div>',
      '      <Hidden />',
      '      <Fancy />',
      '    </div>',
      '  ),',
      '})',
      '',
    ].join('\n'),
  }
  for (const [path, text] of Object.entries(project)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const first = await buildSaved(folder)
  assert.deepEqual(
    first.findings.filter((one) => one.level === 'error'),
    [],
  )
  writeFileSync(join(folder, 'ui/Fancy.tsx'), 'export function Fancy() {\n  return <i>Fancy saved</i>\n}\n')
  const saved = await buildSaved(folder, { running: first.versionId })
  assert.equal(saved.swap, undefined, 'what the server alone draws of the page changed')
})
