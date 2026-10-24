import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { Served } from './served.ts'
import { served } from './served.ts'

/** How many times the app read a query, as its log of calls holds it. */
function readsOf(at: Served, name: string): number {
  const log = new DatabaseSync(join(at.dataFolder, 'logs.db'), { readOnly: true })
  try {
    return Number(Object(log.prepare('SELECT count(*) AS n FROM calls WHERE name = ?').get(name)).n)
  } finally {
    log.close()
  }
}

/** Waits until the log holds what the engine wrote: it writes it after it answered. */
const written = () => new Promise((done) => setTimeout(done, 150))

test('[32-11] a visitor whose page keeps its time zone in `tent_zone` is answered from the cache: the kept answer is drawn in project.zone, and the page corrects the times', async () => {
  const at = await served('cached')
  // The page code writes the cookie for every visitor whose browser is in another zone than the project's.
  const zoned = { headers: { cookie: 'tent_zone=Europe%2FIstanbul' } }
  assert.equal((await fetch(`${at.address}/news`)).status, 200)
  await written()
  const reads = readsOf(at, 'allNews')
  assert.ok(reads > 0)
  assert.equal((await fetch(`${at.address}/news`, zoned)).status, 200)
  await written()
  assert.equal(readsOf(at, 'allNews'), reads, 'the second visitor was drawn afresh')
})
