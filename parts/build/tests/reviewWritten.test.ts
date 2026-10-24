import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { fileSource } from '../../core/internal.ts'
import { describeProject } from '../index.ts'
import { copyOf, errorsOf } from './projects.ts'

/** The names of the definitions of each file of a description. */
function byFile(description: Description): Map<string, string[]> {
  const files = new Map<string, string[]>()
  const places = Object.entries(description.places).sort((a, b) => Number(a[1].from) - Number(b[1].from))
  for (const [name, place] of places) files.set(String(place.file), [...(files.get(String(place.file)) ?? []), name])
  return files
}

/** What a stored record holds along a way of names, or nothing where the way leads nowhere. */
const at = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((found, name) => (found === undefined ? undefined : Reflect.get(Object(found), name)), value)

type Written = { before: Description; after: Description; texts: Record<string, string> }

let once: Promise<Written> | undefined

/** Builds the project of these tests, writes each of its files anew with `fileSource`, and builds it again, once. */
function writtenAnew(): Promise<Written> {
  once ??= (async () => {
    const folder = copyOf('reviewWritten', 'review-written')
    const first = await describeProject(folder)
    assert.deepEqual(errorsOf(first.findings), [])
    const texts: Record<string, string> = {}
    for (const [file, names] of byFile(first.description)) {
      texts[file] = fileSource(first.description, names, { path: file })
      writeFileSync(join(folder, file), texts[file])
    }
    const second = await describeProject(folder)
    assert.deepEqual(errorsOf(second.findings), [])
    return { before: first.description, after: second.description, texts }
  })()
  return once
}

test('[34-2] the rule of a column reads back to the same record: a column that the staff alone may read stays so', async () => {
  const { before, after } = await writtenAnew()
  const salary = ['notes', 'columns', 'salary']
  assert.deepEqual(at(before.tables, ...salary, 'read'), { rule: 'role', role: 'staff' })
  assert.deepEqual(at(after.tables, ...salary), at(before.tables, ...salary))
})

test('[34-2] a column that a from keeps, a sealed column that is found, and the copy of a vector read back to the same record', async () => {
  const { before, after } = await writtenAnew()
  for (const column of [
    ['users', 'columns', 'placed'],
    ['notes', 'columns', 'code'],
    ['notes', 'columns', 'meaning'],
  ])
    assert.deepEqual(at(after.tables, ...column), at(before.tables, ...column), column.join('.'))
})

test('[34-2] lasts of a table reads back to the same record, its filter as a filter, and its time in words', async () => {
  const { before, after, texts } = await writtenAnew()
  assert.deepEqual(after.tables.visits.lasts, before.tables.visits.lasts)
  assert.match(texts['tables/notes.ts'], /lasts: '30 seconds'/)
  assert.match(texts['tables/notes.ts'], /for: '1 month'/)
})

test('[34-2] a trigger on an event with a where reads back to the same record', async () => {
  const { before, after } = await writtenAnew()
  assert.deepEqual(before.flows.hear.on, [{ event: 'run.failed', where: { flow: 'billing' } }])
  assert.deepEqual(after.flows.hear.on, before.flows.hear.on)
})

test('[34-2] the lengths of time of pace are written in words, in the largest unit that says them exactly', async () => {
  const { before, after, texts } = await writtenAnew()
  assert.deepEqual(after.flows.paced.pace, before.flows.paced.pace)
  assert.match(texts['flows/hear.ts'], /debounce: '30 seconds'/)
  assert.match(texts['flows/hear.ts'], /per: '1 hour'/)
})

test('[34-2] the import line from tentjs names the words in the order they are first used', async () => {
  const { texts } = await writtenAnew()
  assert.match(
    texts['tables/notes.ts'],
    /^import \{ table, list, text, number, count, link, role, vector \} from 'tentjs'$/m,
  )
})
