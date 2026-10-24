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
    const found = log.prepare('SELECT count(*) AS n FROM calls WHERE name = ?').get(name)
    return Number(Object(found).n)
  } finally {
    log.close()
  }
}

/** Waits until the log holds what the engine wrote: it writes it after it answered. */
const written = () => new Promise((done) => setTimeout(done, 150))

const page = async (
  at: Served,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; cache: string | null; html: string }> => {
  const got = await fetch(`${at.address}${path}`, init)
  return { status: got.status, cache: got.headers.get('cache-control'), html: await got.text() }
}

test('[32-11] a second request by nobody within the time draws nothing, a signed-in caller is drawn afresh, and a write to a table the screen reads drops the answer', async () => {
  const at = await served('cached')
  const first = await page(at, '/news')
  assert.equal(first.status, 200)
  assert.match(first.html, /First news/)
  await written()
  // A draw reads the query: what one draw writes into the log is the measure of a draw.
  const reads = readsOf(at, 'allNews')
  assert.ok(reads > 0)
  const second = await page(at, '/news')
  assert.equal(second.html, first.html)
  await written()
  assert.equal(readsOf(at, 'allNews'), reads)
  // A name after the question mark that is no state of the screen is no part of what the answer is kept under.
  await page(at, '/news?utm=mail')
  await written()
  assert.equal(readsOf(at, 'allNews'), reads)
  // A caller who is somebody is drawn afresh.
  await at.app.page('/news', { as: { kind: 'user', user: { id: 'u1', roles: [] } } })
  await written()
  assert.equal(readsOf(at, 'allNews'), reads * 2)
  // A write to a table that the screen reads drops it at once.
  await at.app.call('addNews', { title: 'Second news' }, { as: { kind: 'system' } })
  const after = await page(at, '/news')
  assert.match(after.html, /Second news/)
  // A page is sent with no-store whether the cache held it or not.
  assert.equal(after.cache, 'no-store')
})

test('[32-11] an answer with the status 404 is not kept, and a thousand made-up values of a text state leave the cache as it was', async () => {
  const at = await served('cached')
  await page(at, '/news/nothing')
  await written()
  const one = readsOf(at, 'newsById')
  await page(at, '/news/nothing')
  await written()
  assert.equal(readsOf(at, 'newsById'), one * 2)
  // A value of a choice is part of the key, and a value of a text that is not its default draws afresh, and is not kept.
  await page(at, '/news?tab=new')
  await written()
  const draw = readsOf(at, 'allNews')
  await page(at, '/news?tab=new')
  await written()
  assert.equal(readsOf(at, 'allNews'), draw)
  for (let k = 0; k < 1000; k++) await page(at, `/news?search=made${k}`)
  await written()
  assert.equal(readsOf(at, 'allNews'), draw * 1001)
  await page(at, '/news?tab=new')
  await written()
  assert.equal(readsOf(at, 'allNews'), draw * 1001)
})

test('[32-11] with public: true a page that the cache keeps is sent with the header of a shared cache, and one drawn with a state of the device that is not its default with no-store', async () => {
  const at = await served('cached')
  const shared = await page(at, '/shared')
  assert.equal(shared.cache, 'public, max-age=0, s-maxage=60')
  assert.equal((await page(at, '/shared')).cache, 'public, max-age=0, s-maxage=60')
  // A visitor whose device holds a state: the answer is never public.
  const cookie = `tent_state.shop=${Buffer.from(JSON.stringify({ dark: true })).toString('base64url')}`
  assert.equal((await page(at, '/shared', { headers: { cookie } })).cache, 'no-store')
  // A screen with no public says no-store to every browser.
  assert.equal((await page(at, '/news')).cache, 'no-store')
})
