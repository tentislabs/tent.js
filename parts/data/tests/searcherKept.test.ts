import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Clock } from '../../core/internal.ts'
import type { Searcher } from '../index.ts'
import { connected, sqliteStore } from '../index.ts'
import { made, system, tableOf, workFolder } from './work.ts'

test('[20-2] a searcher that failed is held to the bound of what may wait: past it, it is let go, told through noted, and handed its rows again by has at the next opening', (t) => {
  const folder = workFolder(t)
  const plain = sqliteStore()
  plain.open(folder)
  const notes = tableOf('notes', { text: { kind: 'text' } }, { search: ['text'] })
  made(plain, [notes])
  let failing = true
  let holds = false
  const told: string[] = []
  const searcher: Searcher = {
    has: () => holds,
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
  const store = connected(plain, [notes], {
    searcher,
    clock,
    wait: 5000,
    kept: 2000,
    noted: (what) => noted.push(what),
  })
  try {
    for (let k = 0; k < 40; k++) store.write((tx) => tx.add('notes', { text: `note ${k} ${'x'.repeat(100)}` }, system))
    assert.equal(plain.read({ from: 'notes', count: true }, system).value, 40, 'every write stands')
    const closed = noted.filter((one) => Reflect.get(Object(one), 'searcher') === 'closed')
    assert.equal(closed.length, 1, 'the searcher is let go once, and noted is told')
    assert.equal(timers.length, 0, 'nothing waits for a searcher that was let go')
    failing = false
    pass(60_000)
    store.write((tx) => tx.add('notes', { text: 'after' }, system))
    assert.deepEqual(told, [], 'a searcher that was let go is told no write until the next opening')
    store.close()
    store.open(folder)
    assert.equal(told.length, 41, 'at the next opening it is handed every row of the table it does not hold')
    holds = true
    store.write((tx) => tx.add('notes', { text: 'then' }, system))
    assert.equal(told.at(-1), 'then', 'and is told each write again')
  } finally {
    store.close()
  }
})
