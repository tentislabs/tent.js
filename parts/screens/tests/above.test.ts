import assert from 'node:assert/strict'
import { test } from 'node:test'
import { livingPage } from '../page/alive.ts'
import type { Reach } from '../page/reach.ts'
import type { Page, ViewRecord } from '../page/types.ts'
import { pageOf } from './drawn.ts'

const list: ViewRecord = { name: 'listScreen', kind: 'screen', state: { tab: { kind: 'text', default: 'all' } } }
const order: ViewRecord = { name: 'orderScreen', kind: 'screen', state: { open: { kind: 'boolean' } } }

const first = (): Page =>
  pageOf('listScreen', { path: '/orders', load: { screen: 'list.js', parts: [], styles: [], error: '' } })
const upper = (): Page =>
  pageOf('orderScreen', {
    path: '/orders/7',
    params: { id: '7' },
    load: { screen: 'order.js', parts: [], styles: [], error: '' },
    answers: [{ what: 'getOrder', input: { id: '7' }, entry: 'order', value: { id: '7' } }],
  })

function world() {
  const steps = ['/orders']
  const asked: string[] = []
  let back: (() => void) | undefined
  const reach: Reach = {
    post: async () => ({ ok: true, value: null }),
    go: () => {},
    get: async (address) => {
      asked.push(address)
      const path = new URL(address, 'http://x').searchParams.get('path')
      return { ok: true, value: path === '/orders/7' ? upper() : first() }
    },
    load: async (files) => (files.includes('order.js') ? [order] : []),
    shows: () => steps.at(-1) ?? '',
    moved: (address, step) => {
      if (step) steps.push(address)
      else steps[steps.length - 1] = address
    },
    back: (heard) => {
      back = heard
    },
    goBack: () => {
      steps.pop()
      back?.()
    },
  }
  return { reach, steps, asked }
}

const settled = () => new Promise((done) => setTimeout(done, 5))

test('[32-5] a move with above shows the screen over the one that is shown, with its own address, its own state and its answers, and the screen underneath stays as it is', async () => {
  const at = world()
  const page = livingPage(first(), [list], at.reach)
  page.set({ tab: 'paid' })
  page.goTo('/orders/7', { above: true })
  await settled()
  assert.deepEqual(at.asked, ['/_t/screen?path=%2Forders%2F7&version=v1&above=1'])
  assert.deepEqual(at.steps, ['/orders', '/orders/7'])
  // The page still shows its screen, with its state, and the upper screen lies over it.
  assert.equal(page.page.screen, 'listScreen')
  assert.equal(page.state.tab, 'paid')
  const over = page.upper?.()
  assert.equal(over?.page.screen, 'orderScreen')
  assert.deepEqual(over?.page.params, { id: '7' })
  assert.deepEqual(over?.state, { open: false })
  // The answers it came with are held: what its view reads is asked of no engine.
  assert.deepEqual(page.ask('getOrder', { id: '7' }, { entry: 'order' })?.value, { id: '7' })
})

test('[32-5] closing the screen above, and the back button, put the address of the screen underneath back, and a goTo to that screen closes it', async () => {
  const at = world()
  const page = livingPage(first(), [list], at.reach)
  page.goTo('/orders/7', { above: true })
  await settled()
  page.closeAbove?.()
  await settled()
  assert.equal(page.upper?.(), undefined)
  assert.deepEqual(at.steps, ['/orders'])
  // The back button closes it as well, and asks for no screen.
  page.goTo('/orders/7', { above: true })
  await settled()
  const asked = at.asked.length
  at.reach.goBack?.()
  await settled()
  assert.equal(page.upper?.(), undefined)
  assert.equal(at.asked.length, asked)
  // A move to the screen underneath closes it too.
  page.goTo('/orders/7', { above: true })
  await settled()
  page.goTo('/orders')
  await settled()
  assert.equal(page.upper?.(), undefined)
  assert.equal(page.page.screen, 'listScreen')
})
