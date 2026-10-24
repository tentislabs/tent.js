import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { definitionSource, fileSource, write } from '../../core/internal.ts'
import { describeProject } from '../index.ts'
import { copyOf, errorsOf } from './projects.ts'

/** A description as its text, without what names the text of its sources: the places, the fingerprints and the names of the built modules. */
const held = (description: Description): string =>
  write({ ...description, places: {}, sources: {} }).text.replace(/\.[0-9a-f]{12}\.js/g, '.<fp>.js')

/** The names of the definitions of each file of a description, in the order they stand there. */
function byFile(description: Description): Map<string, string[]> {
  const files = new Map<string, string[]>()
  const places = Object.entries(description.places).sort((a, b) => Number(a[1].from) - Number(b[1].from))
  for (const [name, place] of places) files.set(String(place.file), [...(files.get(String(place.file)) ?? []), name])
  return files
}

/** The code of what a call throws, or nothing where it throws no error with a code. */
function codeOf(call: () => unknown): unknown {
  try {
    call()
  } catch (error) {
    return error instanceof Error ? Reflect.get(error, 'code') : undefined
  }
  return undefined
}

/**
 * Builds a project of the tests, writes each of its files anew with `fileSource` where every definition of the
 * file is plain, and builds it again. Answers both descriptions, the text of each file that was written, and the
 * files that hold code.
 */
async function writtenAnew(project: string): Promise<{
  before: Description
  after: Description
  texts: Record<string, string>
  code: string[]
}> {
  const folder = copyOf(project, `written-${project}`)
  const first = await describeProject(folder)
  assert.deepEqual(errorsOf(first.findings), [], project)
  const texts: Record<string, string> = {}
  const code: string[] = []
  for (const [file, names] of byFile(first.description)) {
    const coded = names.filter((name) => codeOf(() => definitionSource(first.description, name)) === 'T0013')
    if (coded.length) {
      // A file with a code definition is left as it stands: code has no text of this kind.
      assert.equal(
        codeOf(() => fileSource(first.description, names, { path: file })),
        'T0013',
      )
      code.push(file)
      continue
    }
    texts[file] = fileSource(first.description, names, { path: file })
    for (const name of names)
      assert.ok(
        texts[file].includes(`${definitionSource(first.description, name)}\n`),
        `the file ${file} holds the text of ${name}`,
      )
    mkdirSync(dirname(join(folder, file)), { recursive: true })
    writeFileSync(join(folder, file), texts[file])
  }
  const second = await describeProject(folder)
  assert.deepEqual(errorsOf(second.findings), [], `${project}, written anew`)
  return { before: first.description, after: second.description, texts, code }
}

test('[34-2] definitionSource of every plain definition of the document of the words reads back to the same record, and fileSource of each of their files builds to the same description', async () => {
  // The files of screens are code: a view has no text of this kind, and each such file is left as it stands.
  const views = { words: [], screens: ['screens/labels.tsx', 'screens/order.tsx', 'screens/orders.tsx'] }
  for (const project of ['words', 'screens'] as const) {
    const { before, after, texts, code } = await writtenAnew(project)
    assert.deepEqual(code.sort(), views[project], `every backend example of ${project} is plain`)
    assert.equal(held(after), held(before), project)
    for (const text of Object.values(texts))
      for (const line of text.split('\n')) assert.ok(line.length <= 120, `no line passes 120 characters: ${line}`)
  }
})

test('[34-2] a run that was read, a rule that was read, and every form of a plan, a filter, a write, a trigger and a type read back to the same record, and a body that reads an option of the project, a top-level const and a text file is written back as that read', async () => {
  const { before, after, texts, code } = await writtenAnew('written')
  assert.deepEqual(code, [])
  assert.equal(held(after), held(before))
  for (const name of ['orderLabel', 'settle', 'remind']) assert.equal(before.functions[name].form, 'plain', name)
  assert.equal(before.flows.bigOrder.form, 'plain')
  const text = texts['functions/orders.ts']
  // The reads are written back as reads, and never as the values they held.
  assert.match(text, /^import intro from '\.\.\/prompts\/intro\.txt'$/m)
  assert.match(text, /^import \{ shop \} from '\.\.\/tent'$/m)
  assert.match(text, /^const PAGE = 20$/m)
  assert.match(text, /^const LABELS = \{ open: 'Open', paid: 'Paid', shipped: 'On its way' \}$/m)
  assert.match(text, /^const SIZES = \[10, 20, 50\]$/m)
  assert.match(text, /label: LABELS\[order\.status\] \?\? LABELS\.open,/)
  assert.match(text, /intro: intro,/)
  assert.match(text, /title: shop\.options\.title,/)
  assert.match(text, /first: shop\.options\.languages\[0\],/)
  assert.match(text, /found\.limit\(PAGE\)\.skip\(input\.page \* PAGE\)\.all\(\)/)
  assert.doesNotMatch(text, /You help customers/)
  // A length of time and a size are written in words, and what equals its default is left out.
  assert.match(
    texts['tent.ts'],
    /limits: \{\n {4}callSize: '2 MB',\n {4}queryTime: '2 seconds',\n {4}liveRows: 500,\n {4}runsKept: '3 months',\n {2}\},/,
  )
  assert.match(texts['flows/orders.ts'], /limits: \{ steps: 200 \},/)
  assert.match(texts['flows/orders.ts'], /^ {2}run: async \(\{ step, db, event, input \}\) => \{$/m)
  assert.match(texts['flows/orders.ts'], /^ {2}onFail: async \(\{ step, failure \}\) => \{$/m)
})

test('[34-2] fileSource of each file of a project that states every option of every backend word builds to the same description, and a file that holds code is left as it stands', async () => {
  const { before, after, code } = await writtenAnew('options')
  assert.deepEqual(code.sort(), ['functions/doors.ts', 'functions/notes.ts', 'tent.ts'])
  assert.equal(held(after), held(before))
})

test('[34-2] the place of each definition is the first character of export and the closing bracket of the call of its word, counted with one line ending, and two definitions of one statement start at one place', async () => {
  const folder = copyOf('edits', 'places')
  const quotes = join(folder, 'screens', 'quotes.tsx')
  writeFileSync(quotes, readFileSync(quotes, 'utf8').replace(/\r?\n/g, '\r\n'))
  const made = await describeProject(folder)
  assert.deepEqual(errorsOf(made.findings), [])
  const places = made.description.places
  const defined = [
    ...Object.keys(made.description.tables),
    ...Object.keys(made.description.functions),
    ...Object.keys(made.description.screens),
    ...Object.keys(made.description.components),
    made.description.app.name,
  ]
  assert.deepEqual(Object.keys(places).sort(), defined.sort())
  for (const [name, place] of Object.entries(places)) {
    const text = readFileSync(join(folder, String(place.file)), 'utf8').replace(/\r\n/g, '\n')
    const at = text.slice(Number(place.from), Number(place.to) + 1)
    assert.ok(at.startsWith('export const '), `${name}: ${at.slice(0, 30)}`)
    assert.ok(at.endsWith(')'), name)
    assert.ok(at.includes(`'${name}'`) || at.includes(`"${name}"`), name)
    assert.notEqual(text[Number(place.to) + 1], ')', name)
  }
  assert.equal(places.firstScreen.from, places.secondScreen.from)
  assert.ok(Number(places.firstScreen.to) < Number(places.secondScreen.to))
  // A semicolon after the call is no part of the place.
  const text = readFileSync(quotes, 'utf8').replace(/\r\n/g, '\n')
  assert.equal(text[Number(places.quotesScreen.to) + 1], ';')
})
