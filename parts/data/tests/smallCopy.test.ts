import assert from 'node:assert/strict'
import test from 'node:test'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { project, table, text, vector } from '../../core/index.ts'
import { at, described, reading, writing } from './shop.ts'
import { generator, size, truth } from './near.ts'
import type { Kept } from './near.ts'
import { switched } from './switch.ts'
import { opened, system, workFolder } from './work.ts'
import type { Store } from '../store.ts'

// The memory a copy holds is read after a collection, so that what a read left behind is not counted with it.
setFlagsFromString('--expose-gc')
// The memory of a collected copy is given back at once, and not by a sweeper beside the program.
setFlagsFromString('--no-concurrent-array-buffer-sweeping')
const collect: unknown = runInNewContext('gc')

/**
 * The bytes that the copy in memory of the vectors of each table holds: a store that builds each copy at its first
 * search is opened on the folder, and the memory of the runtime outside its heap is read before and after each.
 */
function copiesOf(folder: string): { full: number; small: number } {
  const store = opened(folder, { lazy: true })
  const db = reading(store, twice, system)
  const held = (): number => {
    if (typeof collect === 'function') collect()
    return process.memoryUsage().arrayBuffers
  }
  const to = Array.from({ length: size }, () => 0.5)
  const before = held()
  at(db, 'full').near('meaning', to).limit(1).all()
  const full = held() - before
  at(db, 'small').near('meaning', to).limit(1).all()
  const small = held() - before - full
  store.close()
  return { full, small }
}

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const

// The same articles twice: with the full copy of their vectors, and with the copy at one byte a number.
const twice = described([
  project('library', {}),
  table('full', { columns: { title: text(), meaning: vector({ size }) }, access }),
  table('small', { columns: { title: text(), meaning: vector({ size, copy: 'small' }) }, access }),
])

/** A store that holds the same vectors twice, with each copy, and the vectors it was written, by row. */
function filled(
  t: test.TestContext,
  rows: number,
): { store: Store; kept: Kept[]; make: () => Float32Array; folder: string } {
  const folder = workFolder(t)
  const store = opened(folder)
  switched(store, twice)
  const make = generator(1)
  const kept: Kept[] = []
  for (let from = 0; from < rows; from += 2_000)
    writing(
      store,
      twice,
      system,
    )((db) => {
      for (let i = from; i < from + 2_000; i++) {
        const vector = make()
        const meaning = Array.from(vector)
        const title = `Article ${i}`
        at(db, 'full').add({ title, meaning })
        const row = at(db, 'small').add({ title, meaning })
        kept.push({ id: String(row.id), kind: 'a', vector })
      }
    })
  return { store, kept, make, folder }
}

test('[47-8] with `copy: small` the copy keeps about a quarter of the memory, and the answer says it is not exact', (t) => {
  const { store, make, folder } = filled(t, 2_000)
  const { full, small } = copiesOf(folder)
  t.diagnostic(`the full copy holds ${full} bytes, and the one at one byte a number ${small}`)
  assert.ok(full > 0 && small > 0, `both copies hold memory: ${full} and ${small} bytes`)
  // One byte a number in place of four, beside what each row keeps of its own.
  assert.ok(small < full * 0.3, `the copy at one byte a number holds ${small} bytes, and the full one ${full}`)
  const db = reading(store, twice, system)
  const to = Array.from(make())
  assert.ok(
    at(db, 'small')
      .near('meaning', to)
      .limit(10)
      .all()
      .every((row) => row.exact === false),
  )
})

test('[47-8] [night] on 50,000 vectors of 1,536 numbers the best ten of the copy at one byte a number agree with exact search in nine of ten', (t) => {
  const { store, kept, make, folder } = filled(t, 50_000)
  const db = reading(store, twice, system)
  const { full, small } = copiesOf(folder)
  assert.ok(small < full * 0.3, `the copy at one byte a number holds ${small} bytes, and the full one ${full}`)
  const targets = Array.from({ length: 10 }, () => Array.from(make()))
  for (const to of targets) {
    const exact = new Set(truth(kept, to, { limit: 10 }).map((row) => row.id))
    const near = at(db, 'small').near('meaning', to).limit(10).all()
    assert.equal(near.length, 10)
    const agree = near.filter((row) => exact.has(String(row.id))).length
    assert.ok(agree >= 9, `the best ten agree in ${agree} of ten`)
    assert.ok(near.every((row) => row.exact === false))
    // The full copy says nothing of the kind: its answer is exact.
    assert.ok(
      at(db, 'full')
        .near('meaning', to)
        .limit(10)
        .all()
        .every((row) => row.exact === undefined),
    )
  }
})
