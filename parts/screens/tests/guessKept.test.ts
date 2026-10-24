import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reach } from '../page/alive.ts'
import { livingPage } from '../page/browser.ts'
import type { Page } from '../page/types.ts'
import { pageOf, rows } from './drawn.ts'

const came = { what: 'openOrders', input: { limit: 2 }, entry: 'orders', value: rows, mark: 'mark-of-rows' }
const live = { entry: 'orders', live: true }

/** A page that shows a live query, with a reach that keeps each wait it was asked for, and carries one out when told. */
function shown(more: Partial<Page>) {
  const waits: { work: () => void; ms: number }[] = []
  const reach: Reach = {
    post: async () => ({ ok: true, value: 1 }),
    go: () => undefined,
    wait: (work, ms) => {
      waits.push({ work, ms })
      return () => undefined
    },
  }
  const page = livingPage(
    pageOf('s', { path: '/s', answers: [came], user: { id: 'u1', roles: [] }, ...more }),
    [{ name: 's', kind: 'screen' }],
    reach,
  )
  return { page, waits }
}

const without = (list: unknown, input: unknown): unknown =>
  Array.isArray(list) ? list.filter((row) => Object(row).id !== Object(input).order) : list

test('[31-6@6] an optimistic result is kept for the time that the project states as limits.optimisticKept, which the record of the page holds, and for two seconds where it states none', async () => {
  for (const [more, kept] of [
    [{}, 2000],
    [{ optimisticKept: 500 }, 500],
    [{ optimisticKept: 7000 }, 7000],
  ] as const) {
    const { page, waits } = shown(more)
    const now = (): unknown => page.ask('openOrders', { limit: 2 }, live)?.value
    assert.deepEqual(now(), rows)
    await page.call('markPaid', { order: 'a' }, { optimistic: { what: 'openOrders', to: without } })
    assert.deepEqual(now(), [rows[1]], `the optimistic result stands after the answer, kept ${kept}`)
    // The page asked to be woken once, after the time that its record names.
    const drops = waits.filter((one) => one.ms === kept)
    assert.equal(drops.length, 1, `the waits of the page: ${waits.map((one) => one.ms).join(', ')}`)
    drops[0].work()
    assert.deepEqual(now(), rows, `the optimistic result is dropped after ${kept} ms`)
  }
})
