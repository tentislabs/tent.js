import assert from 'node:assert/strict'
import { test } from 'node:test'
import { anyone, count, link, max, min, number, project, sum, table, text } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import type { ColumnType, Searcher, Store, TableStep } from '../index.ts'
import { applySteps, connected, openFiles, sqliteStore } from '../index.ts'
import { foundIn } from '../searchPast.ts'
import { at, described, reading, shopStore, writing } from './shop.ts'
import { made, opened, system, tableOf, workFolder } from './work.ts'

test('[50-2] a write whose undo fails is let go all the same: the next write of that file is not refused', (t) => {
  let failing = true
  // A store whose first undo throws, as a disk that fails at that moment makes it.
  const store = (): Store => {
    const made = sqliteStore()
    const begin = made.begin?.bind(made)
    if (!begin) return made
    made.begin = (how) => {
      const open = begin(how)
      return {
        ...open,
        undo(error) {
          open.undo(error)
          if (!failing) return
          failing = false
          throw new Error('the undo failed')
        },
      }
    }
    return made
  }
  const files = openFiles(workFolder(t), [], { store })
  try {
    assert.throws(
      () =>
        files.write((w) => {
          w.tx()
          throw new Error('the write failed')
        }),
      /the undo failed/,
      'the failure of the undo is not hidden',
    )
    assert.doesNotThrow(() => files.write((w) => w.tx()), 'the next write of the shared file begins')
  } finally {
    // Closed before the folder is removed, which the runner does first of what the test registered.
    files.shared.close()
  }
})

test('[20-2] a search past a column that its rule hides reads a letter as the index does: a Latin letter loses its mark, a Greek and a Cyrillic one keeps it', () => {
  for (const pieces of [false, true]) {
    assert.equal(foundIn({ note: 'Şekerci İstanbul' }, ['note'], 'sekerci istanbul', pieces), true)
    assert.equal(foundIn({ note: 'мой дом' }, ['note'], 'мои', pieces), false, 'й is no и')
    assert.equal(foundIn({ note: 'мой дом' }, ['note'], 'мой', pieces), true)
    assert.equal(foundIn({ note: 'άλφα' }, ['note'], 'αλφα', pieces), false, 'ά is no α')
    assert.equal(foundIn({ note: 'Άλφα' }, ['note'], 'άλφα', pieces), true, 'capitals do not count')
    assert.equal(foundIn({ note: 'kırmızı' }, ['note'], 'kirmizi', pieces), false, 'ı is no i')
  }
})

test('[20-4] a new column whose default is now is filled for the rows that stand by the clock the write is handed, as a db is', (t) => {
  const store = opened(workFolder(t))
  const notes = tableOf('notes', { text: { kind: 'text' } })
  made(store, [notes])
  store.write((tx) => tx.add('notes', { text: 'one' }, system))
  const at = Date.UTC(2031, 0, 2, 3, 4, 5)
  const seen: ColumnType = { kind: 'date', optional: true, default: { now: true } }
  const step: TableStep = { do: 'addColumn', table: 'notes', column: 'seen', to: seen }
  store.write((tx) => applySteps(tx, store, [step], { now: () => at }), { steps: true })
  const [row] = [store.read({ from: 'notes' }, system).value].flat()
  assert.equal(new Date(Object(row).seen).getTime(), at)
})

test('[20-2] a searcher that throws after a commit: the write is answered as done, the failure is noted with its number, and the searcher is handed it again after the wait, the writes after it held behind', (t) => {
  const plain = opened(workFolder(t))
  const notes = tableOf('notes', { text: { kind: 'text' } }, { search: ['text'] })
  made(plain, [notes])
  let failing = true
  const told: string[] = []
  const searcher: Searcher = {
    has: () => true,
    wrote(_table, _id, texts) {
      if (failing) throw new Error('the search is down')
      told.push(String(texts?.text))
    },
    find: () => [],
  }
  // A clock that the test moves: a timer runs when the time is moved past it.
  let now = 1_000_000
  const timers: { at: number; run: () => void }[] = []
  const clock: Clock = {
    now: () => now,
    setTimer(at, run) {
      const timer = { at, run }
      timers.push(timer)
      return () => void timers.splice(timers.indexOf(timer), 1)
    },
  }
  const pass = (ms: number) => {
    now += ms
    for (const timer of timers.filter((one) => one.at <= now)) {
      timers.splice(timers.indexOf(timer), 1)
      timer.run()
    }
  }
  const noted: unknown[] = []
  const store = connected(plain, [notes], { searcher, clock, wait: 5000, noted: (what) => noted.push(what) })
  assert.doesNotThrow(() => store.write((tx) => tx.add('notes', { text: 'one' }, system)), 'the write is answered')
  store.write((tx) => tx.add('notes', { text: 'two' }, system))
  assert.equal(plain.read({ from: 'notes', count: true }, system).value, 2, 'both writes stand')
  assert.deepEqual(told, [], 'the second write waits behind the first')
  assert.deepEqual(
    noted.map((one) => [Reflect.get(Object(one), 'searcher'), Reflect.get(Object(one), 'n')]),
    [['failed', 1]],
  )
  pass(5000)
  assert.deepEqual(told, [], 'failing again, it rests six times the wait')
  failing = false
  pass(30_000)
  assert.deepEqual(told, ['one', 'two'], 'both writes, in order')
  assert.equal(noted.length, 2)
})

const open = anyone('a test reads and writes it')
const orders = table('orders', {
  columns: { customer: link('customers', { onRemove: 'remove' }), total: number() },
  access: { read: open, add: open, change: open, remove: open },
})
const customers = table('customers', {
  columns: {
    name: text(),
    many: number({ from: count({ of: orders, by: 'customer' }) }),
    spent: number({ from: sum({ of: orders, by: 'customer', column: 'total' }) }),
    least: number({ from: min({ of: orders, by: 'customer', column: 'total' }) }),
    most: number({ from: max({ of: orders, by: 'customer', column: 'total' }) }),
  },
  access: { read: open, add: open, change: open, remove: open },
})

test('[45-3] a kept count, sum, least and most move by the one row a write adds, changes or removes, and read no other linked row but the next least or most', (t) => {
  const description = described([project('shop', {}), customers, orders])
  const plain = shopStore(t, description)
  // How many rows each read of the orders inside a write answered: a count answers for every row it counted.
  let reads: number[] = []
  const store: Store = {
    ...plain,
    write: (fn, how) =>
      plain.write(
        (tx) =>
          fn({
            ...tx,
            read(plan, caller) {
              const value = tx.read(plan, caller)
              const rows = plan.count ? Number.POSITIVE_INFINITY : Array.isArray(value) ? value.length : 1
              if (plan.from === 'orders') reads.push(rows)
              return value
            },
          }),
        how,
      ),
  }
  const write = writing(store, description, system)
  const id = String(write((db) => at(db, 'customers').add({ name: 'Ada' })).id)
  const added: string[] = []
  for (let k = 1; k <= 50; k++) added.push(String(write((db) => at(db, 'orders').add({ customer: id, total: k })).id))
  const kept = () => {
    const held = at(reading(plain, description, system), 'customers').get(id)
    return [held?.many, held?.spent, held?.least, held?.most]
  }
  assert.deepEqual(kept(), [50, 1275, 1, 50])

  reads = []
  write((db) => at(db, 'orders').add({ customer: id, total: 7 }))
  assert.deepEqual(kept(), [51, 1282, 1, 50])
  assert.ok(
    reads.every((rows) => rows <= 1),
    `an order added reads ${reads.join(', ')} rows of the orders`,
  )

  reads = []
  write((db) => at(db, 'orders').change(added[10], { total: 100 }))
  assert.deepEqual(kept(), [51, 1371, 1, 100])
  assert.ok(
    reads.every((rows) => rows <= 1),
    `an order changed reads ${reads.join(', ')} rows of the orders`,
  )

  // The order of the least is removed: the next least is the one row asked for.
  reads = []
  write((db) => at(db, 'orders').remove(added[0]))
  assert.deepEqual(kept(), [50, 1370, 2, 100])
  assert.ok(
    reads.every((rows) => rows <= 1),
    `the order of the least removed reads ${reads.join(', ')} rows`,
  )
})
