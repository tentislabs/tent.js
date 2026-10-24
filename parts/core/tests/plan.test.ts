import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boolean, input, project, query, table, text } from '../index.ts'
import { describe } from '../internal.ts'
import { typeCheck } from './typed.ts'

const notes = table('notes', { columns: { body: text(), open: boolean() } })

test('[20-1] limit and skip of a plan take a whole number of zero or more, or a reference, and anything else is T1014 from the word', () => {
  for (const member of ['limit', 'skip'] as const) {
    const of = (value: unknown): unknown => Reflect.apply(notes[member], notes, [value])
    // What they take: zero, a whole number, and a value that is worked out when the plan is carried out.
    for (const value of [0, 1, 50, input('n')]) assert.doesNotThrow(() => of(value), `${member}(${String(value)})`)
    const wrong: [string, unknown][] = [
      ['a number under zero', -1],
      ['a number that is not whole', 1.5],
      ['what is no number', Number.NaN],
      ['a number with no end', Number.POSITIVE_INFINITY],
      ['a text', 'ten'],
      ['nothing', undefined],
      ['null', null],
      ['true', true],
      ['a record', { n: 1 }],
      ['a list', [1]],
      ['a large number', 5n],
    ]
    for (const [what, value] of wrong) {
      assert.throws(
        () => of(value),
        (error) => {
          assert.equal(Reflect.get(Object(error), 'code'), 'T1014', what)
          assert.equal(
            Reflect.get(Object(error), 'message'),
            `${member} of a plan takes a whole number of zero or more.`,
            what,
          )
          return true
        },
        `${member}, ${what}`,
      )
    }
  }
  // The plan holds the number as it was written.
  const { description, findings } = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: notes },
      { value: query('some', { access: 'signedIn', rows: notes.where({ open: true }).skip(0).limit(20) }) },
    ],
  })
  assert.deepEqual(findings, [])
  assert.deepEqual(description.functions.some.plan, {
    from: 'notes',
    where: { col: 'open', is: true },
    skip: 0,
    limit: 20,
  })
})

test('[20-1] a Db carries out what is stored: it has read and write, and the db that code is handed has neither', () => {
  const tables = `import { table, text } from 'tentjs'
export const notes = table('notes', { columns: { body: text() } })
declare module 'tentjs' {
  interface Tables {
    notes: typeof notes
  }
}
`
  const right = `import type { Db } from 'tentjs'
const resolve = (ref: object): unknown => ref
export const reads = (db: Db): unknown => db.read({ from: 'notes', where: { col: 'body', is: { input: 'body' } } }, resolve)
export const readsPlain = (db: Db): unknown => db.read({ from: 'notes' })
export const writes = (db: Db): unknown =>
  db.write([{ add: 'notes', values: { body: 'a' } }, { change: 'notes', id: 'n1', values: {} }, { remove: 'notes', id: 'n1' }], resolve)
export const writesPlain = (db: Db): unknown => db.write([])
`
  assert.deepEqual(typeCheck('db-right', { 'tables.ts': tables, 'right.ts': right }), [])
  const wrong = `import type { ActionDb, ChangeDb, Db, QueryDb } from 'tentjs'
export const a = (db: Db): unknown => db.read(5)
export const b = (db: Db): unknown => db.write({ add: 'notes', values: {} })
export const c = (db: Db): unknown => db.read({ from: 'notes' }, 'resolve')
export const d = (db: QueryDb): unknown => db.read({ from: 'notes' })
export const e = (db: ChangeDb): unknown => db.write([])
export const f = (db: ActionDb): unknown => db.read({ from: 'notes' })
`
  assert.deepEqual(
    typeCheck('db-wrong', { 'tables.ts': tables, 'wrong.ts': wrong }).map((one) => [one.file, one.line]),
    [
      ['wrong.ts', 2],
      ['wrong.ts', 3],
      ['wrong.ts', 4],
      ['wrong.ts', 5],
      ['wrong.ts', 6],
      ['wrong.ts', 7],
    ],
  )
})

test('[13-5] a table that names a private column in search is T1014, since nothing of a private column is told by a search', () => {
  const shop = { value: project('shop', {}) }
  const made = (options: object): object => Object(Reflect.apply(Object(table), undefined, ['people', options]))
  const columns = { name: text(), about: text({ optional: true }), secretNote: text({ private: true }) }
  const refused = [
    { columns, search: ['name', 'secretNote'] },
    { columns, search: { columns: ['secretNote'] } },
    { columns, search: { columns: ['name', 'secretNote'], by: 'pieces' } },
  ]
  for (const options of refused) {
    const { findings } = describe({ definitions: [shop, { value: made(options) }] })
    assert.deepEqual(
      findings.map((finding) => `${finding.code} ${finding.message}`),
      ['T1014 people: `search` names the private column `secretNote`.'],
      JSON.stringify(options.search),
    )
  }
  // The other columns are searched as ever.
  for (const search of [['name', 'about'], { columns: ['name'], by: 'pieces' }]) {
    const { description, findings } = describe({ definitions: [shop, { value: made({ columns, search }) }] })
    assert.deepEqual(findings, [], JSON.stringify(search))
    assert.deepEqual(description.tables.people.search, search)
  }
})
