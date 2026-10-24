import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import type { Change, Row, Store, TableLayout } from '../index.ts'
import {
  applyChange,
  applySteps,
  beginEpoch,
  changesTable,
  cleanSteps,
  connected,
  here,
  hereTable,
  keepChanges,
  keptAt,
  keptChanges,
  setHere,
} from '../index.ts'
import { held, layoutFor, machine, pair, raw, same, shopOf, stored, switchTo, tablesIn } from './machines.ts'
import { at, nOf, seal, sqlOf, writing } from './shop.ts'
import { codeOf, system, workFolder } from './work.ts'

const shop = shopOf()

/** A source of numbers from 0 up to 1 that gives the same numbers on every run. */
function drawer(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const names = ['Acme', 'Bolt', 'acme works', 'Cog', 'Hex nut', 'Wing nut', 'Heron', 'İstanbul', 'a nut and a bolt']

/** One of the mixed writes: every kind of write a `db` and a raw text make, drawn from a seed. */
function mixedWrite(writer: Store, description: ReturnType<typeof shopOf>, draw: () => number): void {
  const pick = <T>(from: T[]): T => from[Math.floor(draw() * from.length)]
  const kind = Math.floor(draw() * 14)
  const o = {
    seal,
    system: true,
    ...(kind === 10 ? { touches: ['orders'] } : kind === 11 ? { touches: ['articles'] } : {}),
  }
  writing(
    writer,
    description,
    system,
    o,
  )((db) => {
    const some = (name: string): Row | undefined => pick(at(db, name).limit(50).all())
    const [customer, order, product, article] = ['customers', 'orders', 'products', 'articles'].map(some)
    const vector = () => [draw(), draw() - 0.5, draw(), draw() * 2]
    if (kind === 0 || !customer)
      at(db, 'customers').add({ name: pick(names), ...(draw() < 0.5 ? { taxNo: `TR-${draw()}` } : {}) })
    else if (kind === 1 || !product)
      at(db, 'products').add({ name: pick(names), price: Math.round(draw() * 1000) / 10 })
    else if (kind === 2 || !order) {
      // An order with two lines.
      const added = at(db, 'orders').add({ customer: customer.id, net: Math.floor(draw() * 100) })
      at(db, 'lines').add({ order: added.id, product: product.id, qty: 1 + Math.floor(draw() * 9) })
      at(db, 'lines').add({ order: added.id, qty: 1 })
    }
    // A change of a row whose earlier version is kept, and a write to a sealed column.
    else if (kind === 3)
      at(db, 'orders').change(String(order.id), { status: pick(['open', 'paid']), memo: pick(names) })
    else if (kind === 4) at(db, 'customers').change(String(customer.id), { taxNo: `TR-${draw()}`, name: pick(names) })
    else if (kind === 5) at(db, 'customers').change(String(customer.id), { taxNo: null, note: pick(names) })
    // A removal whose `onRemove` removes the rows of a second table, and one that clears them.
    else if (kind === 6) at(db, 'orders').remove(String(order.id))
    else if (kind === 7) at(db, 'products').remove(String(product.id))
    // Rows with a vector are added, changed and removed.
    else if (kind === 8 || !article)
      at(db, 'articles').add({ title: pick(names), ...(draw() < 0.8 ? { meaning: vector() } : {}) })
    else if (kind === 9) at(db, 'articles').change(String(article.id), { meaning: draw() < 0.2 ? null : vector() })
    // A raw SQL write that draws a random number, with the table it touches stated.
    else if (kind === 10)
      sqlOf(db)('UPDATE "orders" SET "net" = abs(random() % 1000) WHERE "_n" % 7 = ?', [Math.floor(draw() * 7)])
    // A raw SQL write that names a table with a vector column in what it touches: a row and its vector are removed by hand.
    else if (kind === 11) {
      const n = nOf(db)('articles', String(article.id))
      sqlOf(db)('DELETE FROM "articles__meaning" WHERE "_n" = ?', [n])
      sqlOf(db)('DELETE FROM "articles" WHERE "_n" = ?', [n])
    } else if (kind === 12) at(db, 'articles').remove(String(article.id))
    else at(db, 'products').change(String(product.id), { name: pick(names), price: draw() })
  })
  // After a write that states a table with a vector column in what it touches, the engine has the store of the
  // writer forget that table, as `applyChange` does on a reader.
  if (kind === 11) writer.forget('articles')
}

test('[29-1] a second store that is handed each change of the first by applyChange holds what the first holds, after a thousand mixed writes and three table changes', (t) => {
  let description = shop
  const { writer, reader, changes } = pair(t)
  const draw = drawer(29)
  const steps: Record<number, () => void> = {
    // A table change that adds a column, one that adds `sealed` to a column that holds values, and a clean that
    // holds table steps and no row.
    300: () => {
      description = shopOf({ more: true })
      switchTo(writer, description)
    },
    600: () => {
      description = shopOf({ more: true, sealedNote: true })
      switchTo(writer, description)
    },
    800: () => writer.write((tx) => applySteps(tx, writer, cleanSteps(writer.layout())), { steps: true }),
  }
  for (let i = 1; i <= 1000; i++) {
    steps[i]?.()
    mixedWrite(writer, description, draw)
    if (i % 100 === 0) same(writer, reader, description, `after ${i} writes`)
  }
  // Every write took a number, and each change holds the number, the epoch, the time and the running fingerprint.
  assert.deepEqual(
    changes.map((change) => change.n),
    changes.map((_, i) => i + 1),
  )
  assert.equal(changes.length, 1004)
  assert.equal(
    raw(reader, 'SELECT count(*) AS "n" FROM "orders"')[0].n,
    raw(writer, 'SELECT count(*) AS "n" FROM "orders"')[0].n,
  )
  const last = changes[changes.length - 1]
  assert.equal(last.epoch, `1.${here(writer).id}`)
  assert.equal(last.sum, here(writer).sum)
  assert.equal(here(reader).sum, last.sum)
  assert.notEqual(here(reader).id, here(writer).id)
  // The rows of each engine table that is no machine's own are on the reader: `_t_meta` and `_t_history`.
  assert.ok(stored(reader, '_t_history').length > 100)
  assert.deepEqual(stored(reader, '_t_meta'), stored(writer, '_t_meta'))

  // No record holds a row of a table that is a machine's own, or of the tables of a search index.
  const inRecords = new Set(changes.flatMap((change) => [...tablesIn(change.record).keys()]))
  assert.deepEqual([...inRecords].sort(), [
    '_t_history',
    '_t_meta',
    'articles',
    'articles__meaning',
    'customers',
    'lines',
    'orders',
    'products',
  ])
  // The changes hold what a raw SQL write stated, and the steps of each table change with the layout they lead to.
  assert.ok(changes.some((change) => change.tables?.join() === 'orders' && !change.all))
  assert.ok(changes.some((change) => change.tables?.join() === 'articles'))
  assert.equal(changes.filter((change) => change.layout).length, 4)
  assert.deepEqual(changes[0].layout?.to.map((one) => one.name).sort(), [
    '_t_history',
    'articles',
    'customers',
    'lines',
    'orders',
    'products',
  ])

  // After the table change that added `sealed`, the reader holds the sealed bytes of the writer, with no key of
  // its own, and it took the next change of such a row.
  const sealed = stored(writer, 'customers').filter((row) => typeof row.note === 'string')
  assert.ok(sealed.length > 0 && sealed.every((row) => String(row.note).startsWith(`sealed:customers.note.${row.id}:`)))
  assert.deepEqual(stored(reader, 'customers'), stored(writer, 'customers'))

  // The kept changes of both are the same, and are answered in order after a number.
  const kept = [...keptChanges(reader, 1000)]
  assert.deepEqual(
    kept.map((change) => change.n),
    [1001, 1002, 1003, 1004],
  )
  // A kept change is the change as it travelled: as JSON, in which a moment is text.
  const travelled = (all: Change[]) =>
    JSON.parse(JSON.stringify(all.map((change) => ({ ...change, record: change.record.length }))))
  assert.deepEqual(travelled(kept), travelled(changes.slice(1000)))
  assert.deepEqual(keptAt(reader, 1003), { sum: changes[1002].sum })
  assert.equal(keptAt(reader, 2000), undefined)

  // A write that holds a row of a machine's own table beside a row of the app: its record holds the row of the app
  // alone, and the second store holds nothing of the other.
  writer.write((tx) => {
    setHere(tx, { own: 'https://a.example.com' })
    tx.add('products', { name: 'Own', price: 1 }, system)
  })
  assert.equal(changes.length, 1005)
  assert.deepEqual([...tablesIn(changes[1004].record).keys()].sort(), ['_t_meta', 'products'])
  assert.equal(here(writer).own, 'https://a.example.com')
  assert.equal(here(reader).own, undefined)
  assert.deepEqual(
    stored(reader, hereTable.name)
      .map((row) => row.key)
      .sort(),
    ['id', 'sum'],
  )
  same(writer, reader, description, 'after a write of a table that is a machine own')
})

test('[29-1] which commit takes a number, what its record holds, and how often a store is asked for one', (t) => {
  const plain = machine(t)
  const reader = machine(t)
  // A store that counts how often it is asked for a record.
  let asked = 0
  const counting: Store = {
    ...plain,
    copy: plain.copy && {
      ...plain.copy,
      record: () => {
        asked++
        return Object(plain.copy).record()
      },
    },
  }
  const changes: Change[] = []
  const writer = connected(counting, layoutFor(shop), {
    copy: (change) => {
      changes.push(change)
      applyChange(reader, change)
    },
  })
  // Until its changes are kept, a store is asked for no record, and no change is made: the number is still kept.
  const write = writing(writer, shop, system, { seal, system: true })
  writer.write((tx) => tx.add(hereTable.name, { key: 'note', value: 1 }, system))
  assert.equal(asked, 0)
  assert.equal(changes.length, 0)
  assert.equal(here(writer).kept, undefined)

  // From `copy.keep()` on it is asked once for each commit that takes a number.
  keepChanges(writer)
  assert.deepEqual(here(writer).keptFrom, { n: 0, sum: here(writer).sum })
  assert.equal(here(writer).kept, true)
  switchTo(writer, shop)
  const acme = write((db) => String(at(db, 'customers').add({ name: 'Acme' }).id))
  assert.deepEqual([asked, changes.length], [2, 2])

  // A commit that wrote only a table that states `own` takes no number, and that table is not written on the reader.
  writer.write((tx) => tx.change(hereTable.name, 'note', { value: 2 }, system))
  assert.deepEqual([asked, changes.length], [2, 2])
  assert.equal(here(reader).sum, here(writer).sum)
  assert.deepEqual(
    stored(reader, hereTable.name)
      .map((row) => row.key)
      .sort(),
    ['id', 'sum'],
  )

  // A write that changed no row takes a number, and its record holds the number alone.
  write((db) => sqlOf(db)('UPDATE "customers" SET "name" = ? WHERE "name" = ?', ['x', 'nobody']))
  assert.deepEqual([asked, changes.length, changes[2].n], [3, 3, 3])
  assert.deepEqual([...tablesIn(changes[2].record)], [['_t_meta', 1]])
  // A raw SQL write that was handed no `touches` holds `all`, one that was handed some holds `tables`, and one of
  // a definition that only reads with raw SQL holds neither.
  assert.deepEqual([changes[2].all, changes[2].tables], [true, undefined])
  writing(writer, shop, system, { system: true, touches: ['customers'] })((db) =>
    sqlOf(db)('UPDATE "customers" SET "note" = ? WHERE "id" = ?', ['seen', acme]),
  )
  assert.deepEqual([changes[3].all, changes[3].tables], [undefined, ['customers']])
  writing(writer, shop, system, { system: true, touches: [] })((db) => sqlOf(db)('SELECT 1', []))
  assert.deepEqual([changes[4].all, changes[4].tables, changes[4].n], [undefined, undefined, 5])

  // A write that holds table steps and no row, as a clean makes it, takes a number and reaches the second store.
  switchTo(writer, shopOf({ more: true }))
  const narrower = shopOf()
  assert.equal(changes.length, 6)
  writer.write((tx) => applySteps(tx, writer, [{ do: 'retireColumn', table: 'customers', column: 'more' }]), {
    steps: true,
  })
  writer.write((tx) => applySteps(tx, writer, cleanSteps(writer.layout())), { steps: true })
  assert.deepEqual(
    changes.slice(6).map((change) => [change.n, change.layout?.steps.map((step) => step.do), change.rows]),
    [
      [7, ['retireColumn'], []],
      [8, ['dropColumn'], []],
    ],
  )
  assert.deepEqual([...tablesIn(changes[7].record)], [['_t_meta', 1]])
  assert.equal(asked, 8)
  same(writer, reader, narrower)

  // A write that failed takes no number and is asked for no record.
  assert.equal(
    codeOf(() => write((db) => at(db, 'customers').add({ name: 'Bolt' }) && at(db, 'orders').add({ net: 1 }))),
    'T2107',
  )
  assert.deepEqual([asked, changes.length], [8, 8])
})

test('[29-1] [16-2@3] T0033: a store in which a row was changed by hand, and a change whose sum does not fit, hold nothing of that change', (t) => {
  const { writer, reader, changes, link } = pair(t)
  const write = writing(writer, shop, system, { seal })
  const acme = write((db) => String(at(db, 'customers').add({ name: 'Acme' }).id))
  const order = write((db) => String(at(db, 'orders').add({ customer: acme, net: 10 }).id))
  same(writer, reader, shop)

  // The next change of the writer is held back, and handed to the reader with another `sum`: its rows fit the
  // reader, and its `sum` alone does not. It is refused, and leaves the store as it was.
  const before = held(reader)
  const [sumBefore, keptBefore] = [here(reader).sum, stored(reader, changesTable.name).length]
  link.on = false
  write((db) => at(db, 'orders').change(order, { net: 12 }))
  link.on = true
  const [next] = changes.slice(-1)
  assert.equal(
    codeOf(() => applyChange(reader, { ...next, sum: next.sum.replace(/^./, (first) => (first === '0' ? '1' : '0')) })),
    'T0033',
  )
  assert.deepEqual(held(reader), before)
  assert.deepEqual([here(reader).sum, stored(reader, changesTable.name).length], [sumBefore, keptBefore])
  // The same change with its own `sum` is taken: nothing but the `sum` stood against it.
  applyChange(reader, next)
  same(writer, reader, shop)

  // The row is changed by hand on the reader. The next change of the writer that touches it does not fit.
  reader.write((tx) => tx.change('orders', order, { net: 999 }, system))
  const byHand = held(reader)
  const kept = stored(reader, changesTable.name).length
  assert.equal(
    codeOf(() =>
      write((db) => at(db, 'orders').change(order, { net: 11 }) && at(db, 'customers').add({ name: 'Bolt' })),
    ),
    'T0033',
  )
  // The reader holds nothing of that change: neither the other row it added, nor its number, nor its kept change.
  assert.deepEqual(held(reader), byHand)
  assert.equal(stored(reader, changesTable.name).length, kept)
  assert.equal(here(reader).sum, changes[changes.length - 2].sum)
  assert.equal(stored(reader, 'customers').length, 1)
  // The writer holds it: the clash is the reader's.
  assert.equal(stored(writer, 'customers').length, 2)
})

test('[29-1] two stores that each begin a new epoch at the same write, with two machine ids, hold another sum', (t) => {
  const { writer, reader, changes, link } = pair(t)
  const write = writing(writer, shop, system, { seal })
  write((db) => at(db, 'customers').add({ name: 'Acme' }))
  assert.equal(here(reader).sum, here(writer).sum)
  const at3 = changes.length
  // The reader is cut off: from here on each of the two writes alone.
  link.on = false

  // The reader takes over: its changes are kept from now on, and it begins the next epoch as its writer.
  const taking = connected(reader, layoutFor(shop), { keep: true })
  const mine = taking.write((tx) => beginEpoch(tx, here(reader).id)).value
  const theirs = writer.write((tx) => beginEpoch(tx, here(writer).id)).value
  assert.equal(mine, `2.${here(reader).id}`)
  assert.equal(theirs, `2.${here(writer).id}`)
  // Both made a change at the same number, and the two differ.
  assert.equal(changes.length, at3 + 1)
  const [made] = keptChanges(taking, at3)
  assert.equal(made.n, changes[at3].n)
  assert.deepEqual([made.epoch, changes[at3].epoch], [mine, theirs])
  assert.notEqual(made.sum, changes[at3].sum)
  assert.notEqual(here(reader).sum, here(writer).sum)
  // An epoch is begun above a number that is handed in, where that is higher.
  assert.equal(taking.write((tx) => beginEpoch(tx, here(reader).id, { above: 7 })).value, `8.${here(reader).id}`)
  assert.equal(taking.write((tx) => beginEpoch(tx, here(reader).id, { above: 3 })).value, `9.${here(reader).id}`)
})

test('[29-1] [16-2@3] T0013: a write that said steps and wrote a row before a step that is no making of a table or an index, and a row before addTable is taken', (t) => {
  const { writer, reader } = pair(t)
  const write = writing(writer, shop, system, { seal })
  const acme = write((db) => String(at(db, 'customers').add({ name: 'Acme' }).id))
  const notes: TableLayout = { name: 'notes', columns: { body: { kind: 'text' } }, indexes: [], unique: [], search: [] }
  const before = held(writer)

  const refused = codeOf(() =>
    writer.write(
      (tx) => {
        tx.change('customers', acme, { name: 'Acme Works' }, system)
        writer.applyTableChanges([{ do: 'rebuild', table: 'customers' }])
      },
      { steps: true },
    ),
  )
  assert.equal(refused, 'T0013')
  assert.deepEqual(held(writer), before)
  // A row of a table that is a machine's own may stand before the steps.
  writer.write(
    (tx) => {
      setHere(tx, { own: 'https://a.example.com' })
      writer.applyTableChanges([{ do: 'rebuild', table: 'customers' }])
    },
    { steps: true },
  )
  // A row before `addTable`, `addIndex` and `addUnique` is taken, in a write that said nothing too: the record
  // holds what came before the steps and what follows them, and the reader ends with both.
  writer.write((tx) => {
    tx.change('customers', acme, { name: 'Acme Works' }, system)
    writer.applyTableChanges([
      { do: 'addTable', table: 'notes', layout: structuredClone(notes) },
      { do: 'addIndex', table: 'notes', columns: ['body'] },
    ])
    tx.add('notes', { body: 'the first note' }, system)
  })
  assert.deepEqual(
    stored(reader, 'notes').map((row) => row.body),
    ['the first note'],
  )
  assert.deepEqual(held(reader), held(writer))
  assert.equal(stored(reader, 'customers')[0].name, 'Acme Works')
})

test('[16-4@3] the tables that are a machine own: _t_here and _t_changes, with their columns, their keys and what they hold', (t) => {
  const { writer, reader, changes } = pair(t)
  writing(writer, shop, system, { seal })((db) => at(db, 'customers').add({ name: 'Acme' }))
  for (const store of [writer, reader]) {
    const layouts = Object.fromEntries(store.layout().map((one) => [one.name, one]))
    assert.deepEqual(
      [Object.keys(layouts._t_here.columns), layouts._t_here.key, layouts._t_here.own],
      [['key', 'value'], ['key'], true],
    )
    assert.deepEqual(
      [Object.keys(layouts._t_changes.columns), layouts._t_changes.key, layouts._t_changes.own],
      [['n', 'epoch', 'sum', 'change', 'record'], ['n'], true],
    )
    // `_t_here`: the id of the machine, 26 characters made as the id of a row is, and its running fingerprint.
    const mine = here(store)
    assert.match(mine.id, /^[0-9a-hjkmnp-tv-z]{26}$/)
    assert.match(mine.sum, /^[0-9a-f]{64}$/)
    // `_t_changes`: one row for each kept change, with its number, its epoch, its `sum`, the change without its
    // record as JSON, and the record as raw bytes.
    const kept = stored(store, changesTable.name)
    assert.deepEqual(
      kept.map((row) => row.n),
      [1, 2],
    )
    const [, second] = kept
    const { record, ...rest } = changes[1]
    assert.deepEqual([second.epoch, second.sum], [changes[1].epoch, changes[1].sum])
    assert.deepEqual(second.change, JSON.parse(JSON.stringify(rest)))
    assert.deepEqual(Buffer.from(Object(second.record)), Buffer.from(record))
  }
  // The writer keeps `kept` and where its changes began to be kept; what a machine is set to hold is read back.
  assert.deepEqual([here(writer).kept, here(writer).keptFrom?.n], [true, 0])
  setHere(reader, { role: 'reader', from: 'https://shop.example.com', far: true }, { toDisk: true })
  assert.deepEqual(
    [here(reader).role, here(reader).from, here(reader).far],
    ['reader', 'https://shop.example.com', true],
  )
  setHere(reader, { far: undefined })
  assert.equal(here(reader).far, undefined)
  // The newest change is kept whatever its size, and the oldest go once the records together pass the bound.
  const small = connected(machine(t), layoutFor(shop), { keep: true, kept: 1 })
  switchTo(small, shop)
  writing(small, shop, system, { seal })((db) => at(db, 'customers').add({ name: 'Acme' }))
  assert.deepEqual(
    stored(small, changesTable.name).map((row) => row.n),
    [2],
  )
})

test('[29-1] one that is killed while it applies a change holds all of that write, its kept change with it, or none of it', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'applying.ts')
  const killed = await runKilled(program, { times: 8, within: 500, seed: 29, args: [workFolder(t)] })
  assert.equal(killed.kills, 8)
  for (const [round, one] of killed.ended.entries()) {
    assert.equal(one.code, 0, `seed ${killed.seed}, round ${round}: ${one.out}`)
    assert.match(one.out, /^whole: the reader holds \d+ writes, each with its kept change$/m)
  }
})
