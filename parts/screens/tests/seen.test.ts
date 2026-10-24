import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reach } from '../page/alive.ts'
import { livingPage } from '../page/alive.ts'
import { laterWrite } from '../page/seen.ts'
import { pageOf } from './drawn.ts'

type Message = Record<string, unknown>

const settled = (): Promise<void> => new Promise((done) => setImmediate(done))

test('[29-8] of two writes that answers named, a page keeps the later one: that of the newer epoch, and in one epoch that of the higher number', () => {
  assert.equal(laterWrite(undefined, '1.5'), '1.5')
  assert.equal(laterWrite('1.5', undefined), '1.5')
  assert.equal(laterWrite('1.5', null), '1.5')
  assert.equal(laterWrite('1.5', '1.7'), '1.7')
  assert.equal(laterWrite('1.7', '1.5'), '1.7')
  assert.equal(laterWrite('1.900', '2.3'), '2.3')
  assert.equal(laterWrite('2.3', '1.900'), '2.3')
  // A text that names no write is kept by no page, and takes the place of none.
  assert.equal(laterWrite('1.5', 'orders:4'), '1.5')
  assert.equal(laterWrite(undefined, 'no write'), undefined)
  assert.equal(laterWrite('no write', '1.2'), '1.2')
})

test('[29-8] a page keeps the write that each live message stands at, and names the latest it has seen in every watch', async () => {
  const told: Message[] = []
  let tell: (message: Message) => void = () => undefined
  // What stands for the requests of the page: they keep the latest write, as the page code of a browser does.
  let seen: string | undefined
  const reach: Reach = {
    post: async () => ({ ok: true, value: [] }),
    go: () => undefined,
    wait: () => () => undefined,
    random: () => 0.5,
    seen: () => seen,
    saw(at) {
      seen = laterWrite(seen, at)
    },
    socket: (_address, on) => {
      queueMicrotask(() => on.opened())
      tell = (message) => on.message(JSON.stringify(message))
      return { send: (text) => void told.push(JSON.parse(text)), close: () => undefined }
    },
  }
  const page = livingPage(pageOf('s', { path: '/s' }), [{ name: 's', kind: 'screen' }], reach)
  page.ask('openOrders', {}, { entry: 'orders', live: true })
  await settled()
  // A page that has seen no write names none.
  assert.deepEqual(
    told.map((one) => [one.t, 'seen' in one]),
    [['watch', false]],
  )
  tell({ t: 'result', id: told[0].id, value: [], mark: 'm1', at: '1.7' })
  tell({ t: 'rows', id: told[0].id, was: 'm1', mark: 'm2', at: '1.9', put: [], removed: [] })
  // An earlier write, as a machine that holds less would name it, takes the place of nothing.
  tell({ t: 'result', id: told[0].id, value: [], mark: 'm3', at: '1.8' })
  await settled()
  assert.equal(seen, '1.9')
  page.ask('allCustomers', {}, { entry: 'customers', live: true })
  await settled()
  assert.deepEqual(
    told.map((one) => [one.t, one.query, one.seen]),
    [
      ['watch', 'openOrders', undefined],
      ['watch', 'allCustomers', '1.9'],
    ],
  )
})
