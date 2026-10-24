import assert from 'node:assert/strict'
import { test } from 'node:test'
import { livingPage } from '../page/alive.ts'
import type { Reach } from '../page/reach.ts'
import type { Page, ViewRecord } from '../page/types.ts'
import { pageOf } from './drawn.ts'

const list: ViewRecord = { name: 'listScreen', kind: 'screen', loading: 'Waiting' }
const order: ViewRecord = { name: 'orderScreen', kind: 'screen' }
const waiting: ViewRecord = { name: 'Waiting', kind: 'component' }

const first = (): Page =>
  pageOf('listScreen', { path: '/orders', load: { screen: 'list.js', parts: ['waiting.js'], styles: [], error: '' } })
const next = (answers: Page['answers'] = []): Page =>
  pageOf('orderScreen', { path: '/orders/7', load: { screen: 'order.js', parts: [], styles: [], error: '' }, answers })

/** A browser and an engine whose answers the case lets go one by one, with a clock that the case moves. */
function world(answer: (path: string) => unknown) {
  const asked: string[] = []
  const loaded: string[][] = []
  const held: (() => void)[] = []
  const timers: { at: number; work: () => void }[] = []
  let now = 0
  let saving = false
  const reach: Reach = {
    post: async () => ({ ok: true, value: null }),
    go: () => {},
    get: (address) => {
      asked.push(address)
      const path = new URL(address, 'http://x').searchParams.get('path') ?? ''
      return new Promise((done) => held.push(() => done({ ok: true, value: answer(path) })))
    },
    load: async (files) => {
      loaded.push(files)
      return files.includes('order.js') ? [order] : []
    },
    shows: () => '/orders',
    moved: () => {},
    now: () => now,
    saving: () => saving,
    wait: (work, ms) => {
      const timer = { at: now + ms, work }
      timers.push(timer)
      return () => {
        if (timers.includes(timer)) timers.splice(timers.indexOf(timer), 1)
      }
    },
  }
  return {
    reach,
    asked,
    loaded,
    // Lets every answer that is held go, and waits until the page took them.
    letGo: async () => {
      // What the page asks once what it waited on came is let go as well.
      for (let round = 0; round < 3; round++) {
        await new Promise((done) => setTimeout(done, 2))
        while (held.length) held.shift()?.()
      }
      await new Promise((done) => setTimeout(done, 5))
    },
    later: (ms: number) => {
      now += ms
      for (const timer of timers.filter((one) => one.at <= now)) {
        timers.splice(timers.indexOf(timer), 1)
        timer.work()
      }
    },
    save: (on: boolean) => {
      saving = on
    },
  }
}

test('[32-6] hovering a link to a screen asks for its screen once, with prefetch=1, and the move that follows asks nothing more', async () => {
  const at = world(() => next())
  const page = livingPage(first(), [list, waiting], at.reach)
  page.prefetch?.('/orders/7')
  page.prefetch?.('/orders/7')
  assert.deepEqual(at.asked, ['/_t/screen?path=%2Forders%2F7&version=v1&prefetch=1'])
  await at.letGo()
  // The files of the next screen are prefetched too.
  assert.deepEqual(at.loaded, [['order.js']])
  page.goTo('/orders/7')
  await at.letGo()
  assert.equal(at.asked.length, 1)
  assert.equal(page.page.screen, 'orderScreen')
})

test('[32-6] a screen that reads an action is asked for once more when the move is made, and what was prefetched is kept for thirty seconds', async () => {
  const action = [{ what: 'rates', input: {}, entry: 'rates', left: 'prefetch' as const }]
  const at = world((path) => (path === '/orders/7' ? next(action) : next()))
  const page = livingPage(first(), [list, waiting], at.reach)
  page.prefetch?.('/orders/7')
  await at.letGo()
  page.goTo('/orders/7')
  await at.letGo()
  assert.deepEqual(at.asked, [
    '/_t/screen?path=%2Forders%2F7&version=v1&prefetch=1',
    '/_t/screen?path=%2Forders%2F7&version=v1',
  ])
  const other = world(() => next())
  const again = livingPage(first(), [list, waiting], other.reach)
  again.prefetch?.('/orders/8')
  await other.letGo()
  other.later(31_000)
  again.goTo('/orders/8')
  await other.letGo()
  assert.equal(other.asked.length, 2)
})

test('[32-6] at most four prefetches are on their way at once, and none on a connection that saves data', async () => {
  const at = world(() => next())
  const page = livingPage(first(), [list, waiting], at.reach)
  for (const id of [1, 2, 3, 4, 5, 6]) page.prefetch?.(`/orders/${id}`)
  assert.equal(at.asked.length, 4)
  await at.letGo()
  const saving = world(() => next())
  saving.save(true)
  const thrifty = livingPage(first(), [list, waiting], saving.reach)
  thrifty.prefetch?.('/orders/7')
  assert.deepEqual(saving.asked, [])
})

test('[32-5] a move that takes longer than loadingAfter shows the loading component of the old screen in its place, and the new screen when it is there', async () => {
  const at = world(() => next())
  const page = livingPage(first(), [list, waiting], at.reach)
  page.goTo('/orders/7')
  assert.equal(page.loading?.(), undefined)
  at.later(150)
  assert.equal(page.loading?.(), undefined)
  at.later(100)
  assert.equal(page.loading?.()?.name, 'Waiting')
  await at.letGo()
  assert.equal(page.loading?.(), undefined)
  assert.equal(page.page.screen, 'orderScreen')
})
