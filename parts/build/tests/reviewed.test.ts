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

/** The files of a project by their paths, without what a build keeps for itself. */
const written = (folder: string): Record<string, string> =>
  Object.fromEntries(Object.entries(filesOf(folder)).filter(([path]) => !path.startsWith('.tent/')))

/**
 * Holds a value that the file names by what it is for: after a definition was written anew, a later change of the
 * helper file must still reach it. Lays one definition as it is meant, and answers what the tool said, and whether
 * the later change reaches the definition as it did before the tool wrote.
 */
async function laidThenChanged(
  name: string,
  edit: (meant: Description) => void,
  helper: (text: string) => string,
): Promise<{ wrote: boolean; why: string; same: boolean; reaches: boolean }> {
  const folder = copyOf('reviewed', `reviewed-${name}`)
  const built = await describeProject(folder)
  assert.deepEqual(errorsOf(built.findings), [])
  const base = written(folder)
  const constants = join(folder, 'shared', 'constants.ts')

  // What a later change of the helper file gives where no tool wrote anything.
  writeFileSync(constants, helper(readFileSync(constants, 'utf8')))
  const reached = (await describeProject(folder)).description
  writeFileSync(constants, Buffer.from(base['shared/constants.ts'], 'hex'))
  assert.notEqual(held(reached), held(built.description), 'the change of the helper file reaches the definition')

  const meant: Description = structuredClone(built.description)
  edit(meant)
  const laid = await layDefinition(folder, built, meant, name)
  if (!laid.wrote)
    return {
      wrote: false,
      why: laid.why,
      same: JSON.stringify(written(folder)) === JSON.stringify(base),
      reaches: true,
    }
  writeFileSync(constants, helper(readFileSync(constants, 'utf8')))
  const after = (await describeProject(folder)).description
  const part = Object.hasOwn(reached.tables, name) ? 'tables' : 'screens'
  // The edit apart, the definition is what the later change of the helper file makes of it.
  const value = (d: Description): string => JSON.stringify(d[part][name]).replaceAll('"added":{"kind":"text"},', '')
  return { wrote: true, why: '', same: false, reaches: value(after) === value(reached) }
}

const addColumn = (name: string) => (meant: Description) => {
  Object.assign(Object(meant.tables[name].columns), { added: { kind: 'text' } })
}

for (const [name, what, helper] of [
  [
    'importedConstant',
    'a constant that its file imports from a helper file',
    (text: string) => text.replace('MAX = 80', 'MAX = 60'),
  ],
  [
    'starImported',
    'a constant of a helper file that its file imports whole',
    (text: string) => text.replace('MAX = 80', 'MAX = 60'),
  ],
  [
    'importedCall',
    'a call of a function that its file imports',
    (text: string) => text.replace('max: 200', 'max: 100'),
  ],
] as const)
  test(`[34-2] an edit of a table whose option reads ${what} is refused with every file as it was, or the read stays a read: a later change of the helper file still reaches the definition`, async () => {
    const laid = await laidThenChanged(name, addColumn(name), helper)
    if (!laid.wrote) assert.ok(laid.same, `${name}, refused: every file is byte for byte as it was`)
    assert.ok(laid.reaches, `${name} was written anew with the value in the place of the name it read`)
  })

test('[34-2] an edit of a screen whose option reads a constant that its file imports is refused, or the read stays a read', async () => {
  const laid = await laidThenChanged(
    'importedInOption',
    (meant) => {
      Object.assign(Object(Object(meant.screens.importedInOption.tree).props), { gap: 12 })
    },
    (text) => text.replace("['open', 'paid']", "['held', 'paid']"),
  )
  if (!laid.wrote) assert.ok(laid.same)
  assert.ok(laid.reaches, 'the title was written as the value that the constant held')
})

test('[34-2] an edit of a table whose option reads a top-level const that is taken apart is refused, and names the name', async () => {
  const folder = copyOf('reviewed', 'reviewed-apart')
  const built = await describeProject(folder)
  assert.deepEqual(errorsOf(built.findings), [])
  const base = written(folder)
  const meant: Description = structuredClone(built.description)
  addColumn('takenApart')(meant)
  // `34`, section 7, point 10 (a): "a top-level `const` in an option ... the tool refuses the change, names the name
  // and its line, and changes no file".
  const laid = await layDefinition(folder, built, meant, 'takenApart')
  assert.equal(laid.wrote, false, readFileSync(join(folder, 'tables', 'hands.ts'), 'utf8'))
  assert.match(laid.wrote ? '' : laid.why, /WIDE/)
  assert.deepEqual(written(folder), base)
})

test('[34-2] an edit that needs a word of ours which a backend file does not import adds its import line from tentjs, and the project builds to the description that was meant', async () => {
  const folder = copyOf('reviewed', 'reviewed-word')
  const built = await describeProject(folder)
  assert.deepEqual(errorsOf(built.findings), [])
  const base = written(folder)
  const meant: Description = structuredClone(built.description)
  Object.assign(Object(meant.tables.plainTable.columns), { count: { kind: 'number' } })
  const laid = await layDefinition(folder, built, meant, 'plainTable')
  if (!laid.wrote) {
    assert.deepEqual(written(folder), base, 'refused: every file is byte for byte as it was')
    return
  }
  const made = await describeProject(folder)
  assert.deepEqual(errorsOf(made.findings), [], readFileSync(join(folder, 'tables', 'plain.ts'), 'utf8'))
  assert.equal(held(made.description), held(meant))
})
