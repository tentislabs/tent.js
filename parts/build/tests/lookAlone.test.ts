import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildSaved } from '../index.ts'

// What a save of development is sorted by beside the view: a field of a screen written as code, by the text of its
// code, and a helper, whose importer stands in for it only where its every export is a React component.

const files: Record<string, string> = {
  'tent.ts': "import { project } from 'tentjs'\nexport const shelf = project('shelf', { title: 'Shelf' })\n",
  'ui/tone.ts': "export const tone = 'calm'\n",
  'components/card.tsx': [
    "import { component } from 'tentjs/ui'",
    "import { tone } from '../ui/tone'",
    '',
    "export const Card = component('Card', { view: () => <b data-tone={tone}>Card</b> })",
    '',
  ].join('\n'),
  'screens/about.tsx': [
    "import { screen } from 'tentjs/ui'",
    "import { Card } from '../components/card'",
    '',
    "const kept = (o: { params: Record<string, string> }) => ['Kept', Object.keys(o.params).length].join(' ')",
    '',
    "export const aboutScreen = screen('aboutScreen', {",
    "  path: '/about',",
    "  access: 'anyone',",
    '  seo: {',
    "    description: (o: { params: Record<string, string> }) => ['About', Object.keys(o.params).length].join(' '),",
    '    data: kept,',
    '  },',
    '  view: () => (',
    '    <div>',
    '      <p>About first</p>',
    '      <Card />',
    '    </div>',
    '  ),',
    '})',
    '',
  ].join('\n'),
}

/** Writes the project into a folder of its own, removed when the test ends. */
function projectIn(t: TestContext): string {
  const folder = join(process.cwd(), 'results', 'build', `lookAlone-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

const errorsOf = (built: { findings: { level: string }[] }) => built.findings.filter((one) => one.level === 'error')

test('[31-22] a save that changes a search-engine field of a screen written as code, in its own text or in what it reaches of its file, is taken as a switch with no swap; a save of the view beside it is swapped', async (t) => {
  const folder = projectIn(t)
  let last = await buildSaved(folder)
  assert.deepEqual(errorsOf(last), [])
  assert.deepEqual(Object(Object(last.description.screens.aboutScreen).seo).description, { code: true })
  assert.deepEqual(Object(Object(last.description.screens.aboutScreen).seo).data, { code: true })
  /** Saves the screen file with one text in the place of another, and answers what the build swaps. */
  const swapped = async (from: string, to: string): Promise<string[] | undefined> => {
    const file = join(folder, 'screens/about.tsx')
    const held = readFileSync(file, 'utf8')
    assert.ok(held.includes(from), from)
    writeFileSync(file, held.replace(from, to))
    const next = await buildSaved(folder, { running: last.versionId })
    assert.deepEqual(errorsOf(next), [])
    last = next
    return next.swap
  }
  assert.deepEqual(await swapped('About first', 'About saved'), ['browser/src.screens.about.tsx.js'])
  assert.equal(await swapped("['About',", "['On',"), undefined, 'the text of the field itself')
  assert.equal(await swapped("['Kept',", "['Held',"), undefined, 'a declaration of its file that the field reaches')
  assert.deepEqual(await swapped('About saved', 'About again'), ['browser/src.screens.about.tsx.js'])
})

test('[31-22] a save of a helper that a component file imports, and that exports no component, is taken as a switch with no swap: a file of components alone stands in for a helper, and a component file does not', async (t) => {
  const folder = projectIn(t)
  const first = await buildSaved(folder)
  assert.deepEqual(errorsOf(first), [])
  writeFileSync(join(folder, 'ui/tone.ts'), "export const tone = 'bright'\n")
  const saved = await buildSaved(folder, { running: first.versionId })
  assert.deepEqual(errorsOf(saved), [])
  assert.equal(saved.swap, undefined)
})
