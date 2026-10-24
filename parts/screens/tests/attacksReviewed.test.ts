import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPath } from '../../core/internal.ts'
import { livingPage } from '../page/alive.ts'
import type { Reach } from '../page/reach.ts'
import type { Page, ViewRecord } from '../page/types.ts'
import { pageOf } from './drawn.ts'

// The attacks of `05`, section 4, that the reviewer of the step wrote beside those of its builder.

const list: ViewRecord = { name: 'listScreen', kind: 'screen' }

const first = (): Page =>
  pageOf('listScreen', { path: '/orders', load: { screen: 'list.js', parts: [], styles: [], error: '' } })

test('[05-4.3@7c] a move to a path that leads out of the app once its percent signs are read leads nowhere: no move, no whole page and no asking for it', async () => {
  const gone: string[] = []
  const moved: string[] = []
  const asked: string[] = []
  const reach: Reach = {
    post: async () => ({ ok: true, value: null }),
    go: (address) => void gone.push(address),
    get: async (address) => {
      asked.push(new URL(address, 'http://x').searchParams.get('path') ?? '')
      return { ok: true, value: { ...first(), path: '/orders' } }
    },
    load: async () => [],
    shows: () => moved.at(-1) ?? '/orders',
    moved: (address) => void moved.push(address),
  }
  const page = livingPage(first(), [list], reach)
  for (const address of ['/%2F%2Fevil.example', '/%2f/evil.example', '/%5Cevil.example', '/%09/evil.example'])
    page.goTo(address)
  // A path of the app is asked for, so the page does move.
  page.goTo('/orders/7')
  await new Promise((done) => setTimeout(done, 5))
  assert.ok(asked.includes('/orders/7'), asked.join(' '))
  // Each address that the page loaded, moved to or asked for is a path of the app, also once its signs are read.
  assert.deepEqual(
    [...gone, ...moved, ...asked].filter((one) => !isPath(one.split(/[?#]/)[0])),
    [],
  )
})
