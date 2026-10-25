import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Change, ChangeSink, SinkChange, Store } from '../index.ts'
import { applyChanges, changesTable, connected, hereTable, keepChanges } from '../index.ts'
import { held, layoutFor, machine, shopOf, stored, switchTo } from './machines.ts'
import { at, seal, writing } from './shop.ts'
import { system, workFolder } from './work.ts'

const shop = shopOf()

/** A few writes of the shop: customers added, one changed and one removed, an order with its lines. */
function someWrites(writer: Store): void {
  const write = writing(writer, shop, system, { seal, system: true })
  // The customer added last is removed by its id: a quick computer adds all three in one millisecond.
  let last = ''
  for (const name of ['Acme', 'Bolt', 'Cog'])
    write((db) => {
      last = String(at(db, 'customers').add({ name, taxNo: `TR-${name}` }).id)
    })
  write((db) => {
    const [first] = at(db, 'customers').all()
    at(db, 'customers').change(String(first.id), { name: 'Acme works' })
    const order = at(db, 'orders').add({ customer: first.id, net: 12 })
    at(db, 'lines').add({ order: order.id, qty: 2 })
  })
  write((db) => at(db, 'customers').remove(last))
}

/** A sink that keeps what it is handed: with `records`, as the archive of the engine states it. */
function sinkOf(records: boolean): ChangeSink & { changes: SinkChange[] } {
  const changes: SinkChange[] = []
  return {
    changes,
    ...(records ? { records: true as const } : {}),
    start: (n) => ({ n, all: true }),
    wrote: (change) => void changes.push(change),
  }
}

/** Lets a sink be handed what waits for it: a sink is handed each change after its write, in turn. */
const handed = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((done) => setImmediate(done))
}

/** The keys that `_t_here` of a store holds. */
const hereKeys = (store: Store): string[] => stored(store, hereTable.name).map((row) => String(row.key))

test('[45-1] a sink that records is handed the record of each write with its rows, what a changed row held before, and the data keeps none of it: no kept change, and no running fingerprint', async (t) => {
  const plain = machine(t)
  const archive = sinkOf(true)
  const other = sinkOf(false)
  const writer = connected(plain, layoutFor(shop), { sink: other, archive })
  switchTo(writer, shop)
  someWrites(writer)
  await handed()
  assert.ok(archive.changes.length >= 4)
  assert.deepEqual(
    archive.changes.map((one) => one.n),
    other.changes.map((one) => one.n),
    'each sink is handed every write',
  )
  assert.ok(archive.changes.every((one) => (one.record?.length ?? 0) > 0 || one.layout !== undefined))
  assert.ok(
    other.changes.every((one) => one.record === undefined),
    'a sink that does not record is handed no record',
  )
  const changed = archive.changes.flatMap((one) => one.rows ?? []).find((one) => one.kind === 'changed')
  assert.equal(changed?.before?.name, 'Acme', 'a changed row says what it held before')
  // The data keeps no change of its own for the archive, and works no running fingerprint out.
  assert.deepEqual(stored(plain, changesTable.name), [])
  assert.equal(hereKeys(plain).includes('sum'), false)
  // A store of the first moment, handed the records in order, holds what the writer holds.
  const copy = machine(t)
  applyChanges(copy, archive.changes)
  assert.deepEqual(held(copy), held(plain))
})

test('[45-1] a store opened again goes on handing the sink that records, and one that a reader joins keeps its changes for the reader and hands the sink the same record', async (t) => {
  const folder = workFolder(t)
  const kept: Change[] = []
  const plain = machine(t, folder)
  const archive = sinkOf(true)
  const writer = connected(plain, layoutFor(shop), { archive, copy: (change) => kept.push(change) })
  switchTo(writer, shop)
  someWrites(writer)
  writer.close()
  writer.open(folder)
  await handed()
  const before = archive.changes.length
  someWrites(writer)
  await handed()
  assert.ok(archive.changes.length > before, 'the writes after the opening are handed too')
  assert.ok(archive.changes.slice(before).every((one) => (one.record?.length ?? 0) > 0))
  assert.equal(kept.length, 0, 'no change is kept or handed on for a reader')
  // A reader that joins makes the data keep its changes for it, and the sink is handed the same record.
  keepChanges(writer)
  someWrites(writer)
  await handed()
  assert.ok(kept.length > 0)
  const last = kept.at(-1)
  const same = archive.changes.find((one) => one.n === last?.n)
  assert.deepEqual(same?.record, last?.record)
  assert.ok(stored(plain, changesTable.name).length > 0)
})
