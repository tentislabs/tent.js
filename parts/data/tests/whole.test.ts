import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calc, col, json, list, number, object, project, TentError, table, text, vector } from '../../core/index.ts'
import type { Row } from '../index.ts'
import { createDb } from '../index.ts'
import { failed } from '../sqlite/failed.ts'
import { at, described, reading, sqlOf, writing } from './shop.ts'
import { switched } from './switch.ts'
import { codeOf, opened, system, workFolder } from './work.ts'

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
const shelf = project('shelf', {})

/** The app of these tests: one table whose two number columns hold whole numbers past what the runtime holds. */
const wide = (o: { turned?: boolean } = {}) =>
  described([
    shelf,
    table('wide', {
      columns: {
        label: text(),
        big: number({ whole: true, optional: true }),
        other: o.turned ? text({ optional: true }) : number({ whole: true, optional: true }),
        meaning: vector({ size: 2 }),
        ...(o.turned ? { next: number({ optional: true, from: calc('+', col('big'), 1) }) } : {}),
      },
      access,
    }),
  ])

// A whole number that a word writes, since it is a number of the runtime, and one that only a raw text writes.
const [byWord, byText] = [2 ** 60, '9007199254740993']

test('[20-2] [16-2@3] every read of a row answers a whole number past what the runtime holds as the nearest number, the row that a write reads back and the rows of near among them, and a rebuild keeps such a number as it stands', (t) => {
  const store = opened(workFolder(t))
  switched(store, wide())
  const asSystem = writing(store, wide(), system)
  // The row that an add and a change read back.
  const a = asSystem((db) => at(db, 'wide').add({ label: 'a', big: byWord, other: byWord, meaning: [1, 0] }))
  assert.equal(a.big, byWord)
  const b = asSystem((db) => at(db, 'wide').add({ label: 'b', big: 5, other: 5, meaning: [0, 1] }))
  store.write((tx) => tx.sql(`UPDATE "wide" SET "big" = ${byText} WHERE "label" = 'b'`, []))
  assert.equal(asSystem((db) => at(db, 'wide').change(String(a.id), { label: 'a' })).big, byWord)
  assert.equal(asSystem((db) => at(db, 'wide').change(String(b.id), { label: 'b' })).big, 2 ** 53)
  store.write((tx) => {
    assert.equal(tx.change('wide', String(b.id), { other: 6 }, system).big, 2 ** 53)
    const c = tx.add('wide', { label: 'c', big: byWord, other: 1 }, system)
    assert.equal(c.big, byWord)
    tx.remove('wide', String(c.id), system)
  })

  // The rows of the nearest.
  const rows = () => at(reading(store, wide(), system), 'wide')
  assert.deepEqual(
    rows()
      .near('meaning', [1, 0])
      .limit(2)
      .all()
      .map((row) => [row.label, row.big]),
    [
      ['a', byWord],
      ['b', 2 ** 53],
    ],
  )
  assert.equal(rows().near('meaning', [0, 1]).where({ label: 'b' }).first()?.big, 2 ** 53)

  // What the file holds, to the digit.
  const sql = sqlOf(createDb(store, wide(), system, 'read', {}, { system: true }))
  const digits = (column: string) =>
    sql(`SELECT "label", CAST("${column}" AS TEXT) AS "t", typeof("${column}") AS "k" FROM "wide" ORDER BY "label"`)
  assert.deepEqual(digits('big'), [
    { label: 'a', t: '1152921504606846976', k: 'integer' },
    { label: 'b', t: byText, k: 'integer' },
  ])

  // A switch that turns one such column into a text, and adds a column that is worked out of the other.
  store.write((tx) => tx.sql(`UPDATE "wide" SET "other" = ${byText} WHERE "label" = 'b'`, []))
  switched(store, wide({ turned: true }))
  // A number that the rebuild only carries over stands as it stood.
  assert.deepEqual(digits('big'), [
    { label: 'a', t: '1152921504606846976', k: 'integer' },
    { label: 'b', t: byText, k: 'integer' },
  ])
  // A column that is turned into a text holds the digits of the whole number.
  assert.deepEqual(digits('other'), [
    { label: 'a', t: '1152921504606846976', k: 'text' },
    { label: 'b', t: byText, k: 'text' },
  ])
  const turned = () => at(reading(store, wide({ turned: true }), system), 'wide')
  assert.deepEqual(
    turned()
      .sort('label')
      .all()
      .map((row) => [row.big, row.other]),
    [
      [byWord, '1152921504606846976'],
      [2 ** 53, byText],
    ],
  )
  // The column with `from` is worked out for each row, as an add works it out, and the switch passes.
  const added = writing(store, wide({ turned: true }), system)((db) => at(db, 'wide').add({ label: 'c', big: byWord }))
  assert.deepEqual(
    turned()
      .sort('label')
      .all()
      .map((row) => row.next),
    [added.next, 2 ** 53 + 1, added.next],
  )
  // A number that the runtime holds is turned as ever.
  store.write((tx) => tx.sql(`UPDATE "wide" SET "big" = 7 WHERE "label" = 'c'`, []))
  assert.equal(turned().where({ label: 'c' }).first()?.big, 7)
})

test('[20-2] the mark of a page holds a whole number past what the runtime holds whole, so a page that is sorted by such a column goes on behind it: each row is answered once, and the last page has no next', (t) => {
  const store = opened(workFolder(t))
  switched(store, wide())
  writing(
    store,
    wide(),
    system,
  )((db) => {
    for (const label of ['a', 'b', 'c', 'd']) at(db, 'wide').add({ label, big: 5 })
  })
  store.write((tx) => {
    tx.sql(`UPDATE "wide" SET "big" = ${byText} WHERE "label" = 'b'`, [])
    tx.sql(`UPDATE "wide" SET "big" = 9007199254740995 WHERE "label" = 'c'`, [])
    tx.sql(`UPDATE "wide" SET "big" = NULL WHERE "label" = 'd'`, [])
  })
  const db = reading(store, wide(), system)
  /** Follows `next` from the first page to the last, one row at a time, and answers the labels in their order. */
  const paged = (by: string): unknown[] => {
    const labels: unknown[] = []
    let cursor: string | undefined
    for (let pages = 0; pages < 10; pages++) {
      const page: { rows?: Row[]; next?: string } = Object(at(db, 'wide').sort(by).limit(1).after(cursor).all())
      labels.push(...(page.rows ?? []).map((row) => row.label))
      if (page.next === undefined) return labels
      cursor = page.next
    }
    return [...labels, 'and never ends']
  }
  assert.deepEqual(paged('big'), ['d', 'a', 'b', 'c'])
  assert.deepEqual(paged('-big'), ['c', 'b', 'a', 'd'])
  // Two at a time, and a mark that is no mark.
  const first: { rows?: Row[]; next?: string } = Object(at(db, 'wide').sort('big').limit(3).after(undefined).all())
  const second: { rows?: Row[]; next?: string } = Object(at(db, 'wide').sort('big').limit(3).after(first.next).all())
  assert.deepEqual(
    [first, second].map((page) => (page.rows ?? []).map((row) => row.label)),
    [['d', 'a', 'b'], ['c']],
  )
  assert.equal(second.next, undefined)
  // A mark that a caller wrote by hand. The digits stand beside the values, by the place of their column: what is
  // no whole number that SQLite holds there is no mark, and no error of the store.
  const marked = (mark: unknown) => Buffer.from(JSON.stringify(mark)).toString('base64url')
  const after = (mark: unknown) => () => at(db, 'wide').sort('big').limit(2).after(marked(mark)).all()
  const id = '0'.repeat(26)
  for (const digits of [
    'nine',
    '',
    '1.5',
    '9999999999999999999',
    '9223372036854775808',
    '-9223372036854775809',
    '1'.repeat(20),
    7,
    null,
    ['7'],
    { whole: '7' },
  ])
    assert.equal(codeOf(after([2 ** 53, id, { 0: digits }])), 'T0002', JSON.stringify(digits))
  for (const mark of [
    [2 ** 53, id, { 1: '7' }],
    [2 ** 53, id, { big: '7' }],
    [2 ** 53, id, ['7']],
    [2 ** 53, id, '7'],
    [2 ** 53, id, { 0: '7' }, { 0: '7' }],
  ])
    assert.equal(codeOf(after(mark)), 'T0002', JSON.stringify(mark))
  // The largest and the smallest whole number that SQLite holds are marks, and so are the digits of a small one.
  const labels = (mark: unknown) => Object(after(mark)()).rows.map((row: Row) => row.label)
  assert.deepEqual(labels([2 ** 63, id, { 0: '9223372036854775807' }]), [])
  assert.deepEqual(labels([-(2 ** 63), id, { 0: '-9223372036854775808' }]), ['a', 'b'])
  assert.deepEqual(labels([5, id, { 0: '5' }]), ['a', 'b'])
  assert.deepEqual(labels([2 ** 53, 'z'.repeat(26), { 0: byText }]), ['c'])
  assert.deepEqual(labels([2 ** 53, id, {}]), ['b', 'c'])
})

test('[20-2] a page that is sorted by a list, a record or a json column goes on behind the mark that the store made, and a value of a column that looks like the digits of a mark is a value like any other', (t) => {
  const store = opened(workFolder(t))
  const kept = described([
    shelf,
    table('kept', {
      columns: {
        label: text(),
        names: list(text(), { optional: true }),
        shape: object({ n: number(), word: text() }, { optional: true }),
        loose: json({ optional: true }),
      },
      access,
    }),
  ])
  switched(store, kept)
  writing(
    store,
    kept,
    system,
  )((db) => {
    const add = (label: string, names: string[], n: number, loose: unknown) =>
      at(db, 'kept').add({ label, names, shape: { n, word: label }, loose })
    add('a', ['x', 'y'], 3, { whole: '7' })
    add('b', ['a'], 1, { whole: '7' })
    add('c', [], 2, ['list', 1])
    add('d', ['x'], 5, 'text')
    add('e', ['m', 'n'], 4, { whole: '9007199254740993' })
    at(db, 'kept').add({ label: 'f' })
  })
  const db = reading(store, kept, system)
  for (const by of ['names', 'shape', 'loose', '-names', '-shape', '-loose']) {
    // What one read answers in that order is what the pages answer, two rows a page, each row once.
    const whole = at(db, 'kept')
      .sort(by)
      .all()
      .map((row) => row.label)
    assert.equal(whole.length, 6, by)
    const paged: unknown[] = []
    let cursor: string | undefined
    let pages = 0
    for (; pages < 10; pages++) {
      const page: { rows?: Row[]; next?: string } = Object(at(db, 'kept').sort(by).limit(2).after(cursor).all())
      paged.push(...(page.rows ?? []).map((row) => row.label))
      cursor = page.next
      if (cursor === undefined) break
    }
    assert.deepEqual(paged, whole, by)
    assert.equal(pages, 2, by)
  }
  // The rows whose `json` holds `{ whole: '7' }` are answered with it, as it was written.
  const [first] = at(db, 'kept')
    .where({ label: { in: ['a', 'b'] } })
    .sort('loose')
    .limit(1)
    .all()
  assert.deepEqual(first.loose, { whole: '7' })
})

test('[16-2@3] T0009: what an act of the store throws that is neither an error of SQLite nor one of ours is an error of ours, and what the function of a write itself throws leaves the write as it was thrown', (t) => {
  // What the runtime throws for a value that it cannot hold, a plain error and a thrown text.
  for (const thrown of [new RangeError('too large'), new Error('plain'), 'a text']) {
    const made = failed(thrown, 'wide')
    assert.ok(made instanceof TentError)
    assert.equal(made.code, 'T0009')
    assert.equal(made.cause, thrown)
    assert.match(made.message, /too large|plain|a text/)
  }
  // An error of ours passes as it is.
  const ours = new TentError('T2103', 'not found')
  assert.equal(failed(ours, 'wide'), ours)

  // An error of the function of a write is no error of the store: it leaves as it was thrown, and the write is undone.
  class Mine extends Error {}
  const store = opened(workFolder(t))
  switched(store, wide())
  const [mine, range] = [new Mine('of the app'), new RangeError('of the app too')]
  for (const thrown of [mine, range, 'a text of the app', ours]) {
    let caught: unknown
    try {
      store.write((tx) => {
        tx.add('wide', { label: 'undone' }, system)
        throw thrown
      })
    } catch (error) {
      caught = error
    }
    assert.equal(caught, thrown)
  }
  assert.equal(store.read({ from: 'wide', count: true }, system).value, 0)
})

test('[16-2@3] T0013: a raw text that names a table whose name starts _t_ is refused whether the file holds that table or not', (t) => {
  const store = opened(workFolder(t))
  switched(store, wide())
  // The store was just made: it holds `_t_meta`, and neither `_t_history` nor any other table of the engine.
  assert.deepEqual(
    store
      .layout()
      .map((one) => one.name)
      .filter((name) => name.startsWith('_t_')),
    ['_t_meta'],
  )
  for (const text of [
    'SELECT * FROM "_t_meta"',
    'SELECT * FROM "_t_history"',
    'SELECT count(*) AS "n" FROM _t_history',
    'SELECT * FROM _T_Runs',
    'SELECT "label" FROM "wide" WHERE "id" IN (SELECT "rowId" FROM "_t_history")',
    'SELECT * FROM main._t_holds',
    'DELETE FROM "_t_history"',
    'UPDATE _t_none SET x = 1',
    'INSERT INTO "_t_history" ("id") VALUES (1)',
  ]) {
    assert.equal(
      codeOf(() => store.sql?.(text, [])),
      'T0013',
      text,
    )
    assert.equal(
      codeOf(() => store.write((tx) => tx.sql(text, []))),
      'T0013',
      text,
    )
  }
  // A table of an app that the file does not hold is no table of the engine: the store fails in its own words.
  assert.equal(
    codeOf(() => store.sql?.('SELECT * FROM "tables"', [])),
    'T0009',
  )
})
