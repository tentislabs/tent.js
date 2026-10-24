import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Asker, Keeper } from '../rooms/callables.ts'
import { intoOf, outOf, rowsOut } from '../rooms/callables.ts'
import { rowsAsText, rowsOfText } from '../rooms/crossing.ts'

// A side that keeps nothing: the values of these tests hold no function, promise, stream or `db`.
const keep: Keeper = { fn: () => 0, promise: () => 0, stream: () => 0, db: () => undefined }
const ask: Asker = {
  fn: () => undefined,
  promise: async () => undefined,
  pull: async () => undefined,
  db: () => ({}),
}
const bounds = { depth: 64, size: 1_000_000 }

// A table with a column of each kind, and two of its rows with every kind of value it holds.
const columns = {
  title: { kind: 'text' },
  count: { kind: 'number' },
  done: { kind: 'boolean' },
  at: { kind: 'date' },
  on: { kind: 'day' },
  data: { kind: 'json' },
  color: { kind: 'choice', values: ['red', 'blue'] },
  owner: { kind: 'link', table: 'users' },
  paper: { kind: 'file' },
  embedding: { kind: 'vector', size: 3 },
  tags: { kind: 'list', of: { kind: 'text' } },
  place: { kind: 'object', shape: { name: { kind: 'text' }, rooms: { kind: 'number' } } },
  scores: { kind: 'map', of: { kind: 'number' } },
  either: { kind: 'oneOf', of: [{ kind: 'text' }, { kind: 'number' }] },
}
const rows = [
  {
    id: '01jz0000000000000000000001',
    createdAt: new Date('2026-10-19T08:30:00.125Z'),
    updatedAt: new Date('2026-10-19T09:00:00.000Z'),
    title: 'A title with "quotes", a line\nand ünïcode',
    count: -12.5,
    done: true,
    at: new Date(0),
    on: '2026-10-19',
    data: { nested: [1, 'two', null, { deep: false }], empty: {} },
    color: 'red',
    owner: '01jz0000000000000000000002',
    paper: 'f'.repeat(64),
    embedding: [0.25, -1, 3],
    tags: ['one', 'two'],
    place: { name: 'Home', rooms: 4 },
    scores: { ada: 3, bob: 0 },
    either: 7,
  },
  {
    id: '01jz0000000000000000000003',
    createdAt: new Date('2026-10-19T08:31:00.000Z'),
    updatedAt: null,
    title: '',
    count: 0,
    done: false,
    at: null,
    on: null,
    data: null,
    color: 'blue',
    owner: null,
    paper: null,
    embedding: null,
    tags: [],
    place: null,
    scores: {},
    either: 'text',
  },
]

/** A value as it crosses by the structured clone of the runtime, from one side to the other. */
const cloned = (value: unknown): unknown => intoOf(structuredClone(outOf(value, keep, bounds)), ask)

test('[52-5] every kind of value of the rows of a read arrives as it was sent, by the JSON text and by the structured clone, and the crossing chooses the text for a table whose values JSON holds', () => {
  const written = rowsAsText(rows, columns)
  assert.ok(written, 'the rows of a table whose values JSON holds cross as JSON text')
  assert.deepStrictEqual(rowsOfText(written.text, written.moments), rows, 'by the JSON text')
  assert.deepStrictEqual(cloned(rows), rows, 'by the structured clone')
  // The rows of a read reach the other side as the text, and come out as they were sent.
  const out = rowsOut(rows, columns, keep)
  assert.equal(Reflect.get(Object(out), '\u0000tent'), 'rows')
  assert.deepStrictEqual(intoOf(structuredClone(outOf(out, keep, bounds)), ask), rows)
})

test('[52-5] the rows of a table with a column whose values JSON does not hold as themselves, and every value that is no rows of a read, cross by the structured clone and arrive as they were sent', () => {
  // Moments inside a list and a record, which JSON writes as text.
  const deep = {
    ...columns,
    moments: { kind: 'list', of: { kind: 'date' } },
    since: { kind: 'object', shape: { at: { kind: 'date' } } },
  }
  const deepRows = rows.map((row, n) => ({
    ...row,
    moments: n ? [] : [new Date('2025-01-01T00:00:00.000Z'), new Date('2026-12-31T23:59:59.999Z')],
    since: n ? null : { at: new Date('2020-02-29T12:00:00.000Z') },
  }))
  assert.equal(rowsAsText(deepRows, deep), undefined, 'a column whose moments stand inside it')
  assert.equal(rowsOut(deepRows, deep, keep), deepRows, 'the answer crosses as values')
  assert.deepStrictEqual(cloned(deepRows), deepRows, 'by the structured clone')
  const unknownKind = { ...columns, other: { kind: 'ref', name: 'Thing' } }
  assert.equal(rowsAsText(rows, unknownKind), undefined, 'a column of a kind JSON does not hold')
  assert.equal(rowsAsText(rows, undefined), undefined, 'a read whose table is not known')
  const values = {
    big: 12345678901234567890n,
    nothing: undefined,
    map: new Map<unknown, unknown>([
      ['a', 1],
      [2, new Date(5)],
    ]),
    set: new Set([1, 'two']),
    pattern: /a(b)c/gi,
    buffer: new Uint8Array([1, 2, 3]).buffer,
    bytes: new Uint8Array([4, 5, 6]),
    when: new Date('2026-10-19T00:00:00.000Z'),
    list: [1, [2, [3]], { four: 4 }],
  }
  assert.deepStrictEqual(cloned(values), values)
})
