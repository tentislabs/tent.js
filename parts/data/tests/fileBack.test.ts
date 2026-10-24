import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Store } from '../index.ts'
import { bringUp, layoutOf } from '../index.ts'
import {
  tenantSteps,
  appOf,
  filesOf,
  metaOf,
  readingFiles,
  seedDesk,
  storedIn,
  teamFile,
  writingFiles,
} from './apart.ts'
import { at } from './shop.ts'
import { codeOf } from './work.ts'

const first = appOf()
const renamed = appOf({ renamed: true })
const required = appOf({ noteRequired: true })

/** The columns that a store holds of a table and still uses, in the order of their names. */
const columnsOf = (store: Store | undefined, table: string): string[] => {
  const layout = store?.layout().find((one) => one.name === table)
  return Object.keys(layout?.columns ?? {})
    .filter((name) => !layout?.unused?.includes(name))
    .sort()
}

test('[50-5@6] a file goes back by the steps it was brought up by, turned round: a renamed column takes its old name with its values, and the file is brought up again with nothing lost', (t) => {
  const files = filesOf(t, first)
  const s = seedDesk(files, first)
  const old = writingFiles(files, first)
  const north = teamFile(s.north)
  old((db) => at(db, 'orders').of(s.north).add({ total: 10, note: 'kept', code: 'A' }))
  const stoodAt = metaOf(Object(files.of(north)), 'fingerprint')
  const steps = tenantSteps(first, renamed)
  assert.deepEqual(
    steps.filter((step) => step.do === 'renameColumn').map((step) => [step.table, step.from, step.column]),
    [['orders', 'note', 'remark']],
  )
  files.layout(layoutOf(renamed))
  bringUp(Object(files.of(north)), layoutOf(renamed))
  assert.equal(columnsOf(files.of(north), 'orders').includes('remark'), true)
  const now = writingFiles(files, renamed)
  now((db) => at(db, 'orders').of(s.north).add({ total: 20, remark: 'later', code: 'B' }))

  // The way back with the steps: the column has its old name, and each row its value, the later one too.
  files.layout(layoutOf(first))
  bringUp(Object(files.of(north)), layoutOf(first), { back: true, turned: steps })
  assert.equal(metaOf(Object(files.of(north)), 'fingerprint'), stoodAt)
  assert.equal(columnsOf(files.of(north), 'orders').includes('note'), true)
  assert.equal(columnsOf(files.of(north), 'orders').includes('remark'), false)
  assert.deepEqual(
    storedIn(files.of(north), 'orders')
      .map((one) => [one.code, one.note])
      .sort(),
    [
      ['A', 'kept'],
      ['B', 'later'],
    ],
  )
  const db = readingFiles(files, first)
  assert.deepEqual(
    at(db, 'orders')
      .of(s.north)
      .all()
      .map((row) => row.note)
      .sort(),
    ['kept', 'later'],
  )
  // The same file is brought up again by the same steps: going back and forth loses nothing.
  files.layout(layoutOf(renamed))
  bringUp(Object(files.of(north)), layoutOf(renamed))
  assert.deepEqual(
    storedIn(files.of(north), 'orders')
      .map((one) => [one.code, one.remark])
      .sort(),
    [
      ['A', 'kept'],
      ['B', 'later'],
    ],
  )
})

test('[50-5@6] a file that goes back over a column which the switch made required holds a row with no value again', (t) => {
  const files = filesOf(t, first)
  const s = seedDesk(files, first)
  const old = writingFiles(files, first)
  const north = teamFile(s.north)
  old((db) => at(db, 'orders').of(s.north).add({ total: 10, note: 'kept', code: 'A' }))
  const steps = tenantSteps(first, required)
  files.layout(layoutOf(required))
  bringUp(Object(files.of(north)), layoutOf(required))
  const strict = writingFiles(files, required)
  assert.equal(
    codeOf(() => strict((db) => at(db, 'orders').of(s.north).add({ total: 20, code: 'B' }))),
    'T2107',
  )
  files.layout(layoutOf(first))
  bringUp(Object(files.of(north)), layoutOf(first), { back: true, turned: steps })
  old((db) => at(db, 'orders').of(s.north).add({ total: 20, code: 'B' }))
  assert.deepEqual(
    storedIn(files.of(north), 'orders')
      .map((one) => [one.code, one.note ?? null])
      .sort(),
    [
      ['A', 'kept'],
      ['B', null],
    ],
  )
})
