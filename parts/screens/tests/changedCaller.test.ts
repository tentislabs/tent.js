import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reach } from '../page/alive.ts'
import { livingPage } from '../page/browser.ts'
import type { Page } from '../page/types.ts'
import { pageOf } from './drawn.ts'

/** Lets what a page started come to its end. */
const settled = () => new Promise((done) => setTimeout(done, 2))

const came = { what: 'openOrders', input: {}, entry: 'orders', value: [{ id: 'mine' }] }

/** A page that was drawn for one user, over an engine that answers what the case gives. */
function pageOver(answer: (address: string) => unknown) {
  const sent: string[] = []
  const gone: string[] = []
  const reach: Reach = {
    post: async (address) => {
      sent.push(address)
      return answer(address)
    },
    get: async (address) => {
      sent.push(address)
      return answer(address)
    },
    go: (address) => void gone.push(address),
    every: () => () => undefined,
    shows: () => '/s',
    load: async (files) => files.map((file) => ({ name: file.replace(/\.js$/, ''), kind: 'screen' as const })),
  }
  const first: Page = pageOf('s', { path: '/s', answers: [came], user: { id: 'u1', roles: [] } })
  return { page: livingPage(first, [{ name: 's', kind: 'screen' }], reach), sent, gone }
}

test('[22-7] a call that failed and says that the caller changed makes the page forget what it holds and ask for its screen again, as one that worked does, and no address is loaded anew', async () => {
  const asOther: Page = pageOf('s', {
    path: '/s',
    user: { id: 'u2', roles: [] },
    answers: [{ ...came, value: [{ id: 'theirs' }] }],
  })
  const refused = {
    ok: false,
    caller: 'changed',
    error: { code: 'T3101', name: 'not-allowed', message: 'The caller is no longer the one the page was drawn for.' },
  }
  // The door did not run the call: the user of the page is no longer its caller.
  const stale = pageOver((address) => (address.startsWith('/_t/screen') ? { ok: true, value: asOther } : refused))
  await assert.rejects(stale.page.call('markPaid', {}), { code: 'T3101' })
  await settled()
  assert.deepEqual(stale.sent, ['/_t/call/markPaid', '/_t/screen?path=%2Fs&version=v1'])
  assert.deepEqual(stale.page.page.user, { id: 'u2', roles: [] })
  assert.deepEqual(stale.page.ask('openOrders', {}, { entry: 'orders' })?.value, [{ id: 'theirs' }])
  assert.deepEqual(stale.gone, [])

  // A sign-in that started its session and failed afterwards says so too: the page is the new caller's.
  const failed = {
    ok: false,
    caller: 'changed',
    error: { code: 'T0009', name: 'internal', message: 'Something went wrong.' },
  }
  const signed = pageOver((address) => (address.startsWith('/_t/screen') ? { ok: true, value: asOther } : failed))
  await assert.rejects(signed.page.call('signIn', {}), { code: 'T0009' })
  await settled()
  assert.deepEqual(signed.page.page.user, { id: 'u2', roles: [] })
  assert.deepEqual(signed.gone, [])

  // A failure that says nothing of the caller leaves the page as it was.
  const plain = pageOver(() => ({ ok: false, error: failed.error }))
  await assert.rejects(plain.page.call('markPaid', {}), { code: 'T0009' })
  await settled()
  assert.deepEqual(plain.sent, ['/_t/call/markPaid'])
  assert.deepEqual(plain.page.page.user, { id: 'u1', roles: [] })
})
