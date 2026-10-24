import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { write } from '../../core/internal.ts'
import { describeProject } from '../index.ts'
import { layDefinition } from './laying.ts'
import { copyOf, errorsOf, filesOf } from './projects.ts'

/** A description as its text, without what names the text of its sources. */
const held = (description: Description): string =>
  write({ ...description, places: {}, sources: {} }).text.replace(/\.[0-9a-f]{12}\.js/g, '.<fp>.js')

/** The files of a project by their paths, as text, without what a build keeps for itself. */
const textsOf = (folder: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(filesOf(folder))
      .filter(([path]) => !path.startsWith('.tent/') && path !== 'tent.d.ts')
      .map(([path, hex]) => [path, Buffer.from(hex, 'hex').toString('utf8')]),
  )

/** A later change of every value that a definition of the project reads: the helper file, and the files' own names. */
const later: [string, string, string][] = [
  ['shared/values.ts', 'MAX = 80', 'MAX = 61'],
  ['shared/values.ts', 'LIMIT = 20', 'LIMIT = 21'],
  ['shared/values.ts', "TITLE = 'Orders'", "TITLE = 'Bills'"],
  ['shared/values.ts', "['open', 'paid']", "['held', 'paid']"],
  ['shared/values.ts', 'max: 200', 'max: 150'],
  ['tables/reads.ts', 'NAME_LENGTH = 40', 'NAME_LENGTH = 41'],
  ['tables/reads.ts', '{ WIDE: 120 }', '{ WIDE: 121 }'],
  ['tables/reads.ts', '[NARROW] = [12]', '[NARROW] = [13]'],
  ['tables/reads.ts', 'max: 8', 'max: 9'],
  ['tables/reads.ts', "common = { access: { read: 'signedIn' } }", "common = { access: { read: 'anyone' } }"],
]

/** Makes the later change in a folder. */
function changeLater(folder: string): void {
  for (const [path, from, to] of later) {
    const file = join(folder, path)
    const text = readFileSync(file, 'utf8')
    if (text.includes(from)) writeFileSync(file, text.replace(from, to))
  }
}

/** One edit of a definition, as a tool is asked for it: of a table or of a query. */
function edit(description: Description, name: string): void {
  if (Object.hasOwn(description.tables, name))
    Object.assign(Object(description.tables[name].columns), { added: { kind: 'number' } })
  else {
    const plan = Object(description.functions[name].plan)
    plan.limit = Number(plan.limit) + 1
  }
}

const isRead = /reads|helper|own|whole|taken|spread/i

test('[34-2] edits of definitions that read a value: of a helper file, of a helper file imported whole, of an imported function, of a const that is taken apart, of the file, through a spread, and of none, in tables and queries: a read stays a read, or the tool refuses with every file as it was', async (t) => {
  const project = copyOf('reads', 'reads')
  const built = await describeProject(project)
  assert.deepEqual(errorsOf(built.findings), [])
  const base = textsOf(project)
  // What the later change makes of the project where no tool wrote anything.
  changeLater(project)
  const reached = (await describeProject(project)).description
  for (const [path, text] of Object.entries(base)) writeFileSync(join(project, path), text)

  // A screen and a component have no text of this kind: their view is code, which a tool writes as the text of its file.
  const views = [...Object.keys(built.description.screens), ...Object.keys(built.description.components)]
  const names = Object.keys(built.description.places).filter((name) => name !== 'shop' && !views.includes(name))
  const right: string[] = []
  const refused: Record<string, string[]> = {}
  const wrong: string[] = []
  for (const name of names) {
    const meant: Description = structuredClone(built.description)
    edit(meant, name)
    const laid = await layDefinition(project, built, meant, name)
    if (!laid.wrote) {
      assert.deepEqual(textsOf(project), base, `${name}, refused: every file is byte for byte as it was`)
      const why = laid.why.replace(/ on line \d+/, '').replace(/`[^`]+`/g, '<name>')
      refused[why] = [...(refused[why] ?? []), name]
      continue
    }
    const made = await describeProject(project)
    const ok = !errorsOf(made.findings).length && held(made.description) === held(meant)
    // The read stays a read: the later change reaches the definition as it reaches it where nothing was written.
    changeLater(project)
    const after = (await describeProject(project)).description
    const expected: Description = structuredClone(reached)
    edit(expected, name)
    const part = Object.hasOwn(after.tables, name) ? 'tables' : 'functions'
    const reaches = JSON.stringify(after[part][name]) === JSON.stringify(expected[part][name])
    if (ok && reaches) right.push(name)
    else
      wrong.push(
        `${name}: ${ok ? 'the read became a value' : errorsOf(made.findings).join(' ') || 'another description'}`,
      )
    for (const [path, text] of Object.entries(base)) writeFileSync(join(project, path), text)
  }
  t.diagnostic(`right: ${right.length} ${JSON.stringify(right)}`)
  t.diagnostic(`refused: ${Object.values(refused).flat().length} ${JSON.stringify(refused)}`)
  assert.deepEqual(wrong, [], 'no result is wrong')
  // Each definition that reads no value is written, and each that reads one is refused or keeps the read.
  for (const name of ['plainTable', 'bareTable', 'plainQuery']) assert.ok(right.includes(name), name)
  for (const name of names) if (!right.includes(name)) assert.match(name, isRead, `${name} is refused`)
})

test('[34-2] a word that a backend file lacks is imported from tentjs after the last import line, behind its comment, and the file builds to what was meant', async () => {
  const project = copyOf('reads', 'reads-word')
  const built = await describeProject(project)
  const meant: Description = structuredClone(built.description)
  edit(meant, 'bareTable')
  const laid = await layDefinition(project, built, meant, 'bareTable')
  assert.equal(laid.wrote, true)
  const text = readFileSync(join(project, 'tables', 'bare.ts'), 'utf8')
  assert.ok(
    text.startsWith("import { table, text } from 'tentjs' // the words of ours\nimport { number } from 'tentjs'\n"),
    text,
  )
  const made = await describeProject(project)
  assert.deepEqual(errorsOf(made.findings), [])
  assert.equal(held(made.description), held(meant))
})
