import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Store } from '../index.ts'
import { restore } from '../index.ts'
import { made, opened, system, tableOf, workFolder } from './work.ts'

const entries = tableOf('entries', { k: { kind: 'number', whole: true } })

/** Adds one row in a write of its own. */
const addOne = (store: Store, k: number) => store.write((tx) => tx.add('entries', { k }, system))

/** How many rows the table holds, as the store reads them. */
const count = (store: Store): unknown => store.read({ from: 'entries', count: true }, system).value

test('[20-9] a restore whose file cannot be put in its place fails with T0009 and leaves the store open on the data as it was, which then is written, put back and closed', async (t) => {
  const folder = workFolder(t)
  const store = opened(folder)
  made(store, [entries])
  addOne(store, 1)
  const snapshot = join(folder, 'one.db')
  await store.snapshot(snapshot)
  addOne(store, 2)
  // The disk refuses the copy beside the data file: the place it is written to is a folder that holds a file.
  const coming = join(folder, 'data.db.coming')
  mkdirSync(coming)
  writeFileSync(join(coming, 'held'), '')
  await assert.rejects(restore(store, snapshot), { code: 'T0009' })
  assert.equal(count(store), 2)
  addOne(store, 3)
  assert.equal(count(store), 3)
  rmSync(coming, { recursive: true, force: true })
  await restore(store, snapshot)
  assert.equal(count(store), 1)
  store.close()
})
