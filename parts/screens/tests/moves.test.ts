import assert from 'node:assert/strict'
import { test } from 'node:test'
import { livingPage } from '../page/alive.ts'
import type { Reach } from '../page/reach.ts'
import type { Page, ViewRecord } from '../page/types.ts'
import { pageOf } from './drawn.ts'

const list: ViewRecord = {
  name: 'listScreen',
  kind: 'screen',
  state: { tab: { type: { kind: 'text', default: 'all' }, in: 'address' } },
}
const order: ViewRecord = { name: 'orderScreen', kind: 'screen', state: { open: { kind: 'boolean' } } }

/** What stands for a browser and an engine in these tests: the engine answers each address with what the case gives. */
function world(answers: Record<string, unknown>) {
  const steps: string[] = ['/orders']
  const asked: string[] = []
  const loaded: string[][] = []
  const gone: string[] = []
  const arrived: object[] = []
  let back: (() => void) | undefined
  const reach: Reach = {
    post: async () => ({ ok: true, value: null }),
    go: (address) => void gone.push(address),
    get: async (address) => {
      asked.push(address)
      const path = new URL(address, 'http://x').searchParams.get('path') ?? ''
      return Object.hasOwn(answers, path) ? { ok: true, value: answers[path] } : { ok: false, error: { code: 'T0001' } }
    },
    load: async (files) => {
      loaded.push(files)
      return files.includes('order.js') ? [order] : []
    },
    shows: () => steps.at(-1) ?? '',
    address: (written, step) => {
      const path = (steps.at(-1) ?? '').split('?')[0]
      const next = `${path}${written ? `?${written}` : ''}`
      if (step) steps.push(next)
      else steps[steps.length - 1] = next
    },
    moved: (address, step) => {
      if (step) steps.push(address)
      else steps[steps.length - 1] = address
    },
    arrived: (how) => void arrived.push(how),
    back: (heard) => {
      back = heard
    },
  }
  return {
    reach,
    steps,
    asked,
    loaded,
    gone,
    arrived,
    goBack: () => {
      steps.pop()
      back?.()
    },
  }
}

const settled = () => new Promise((done) => setTimeout(done, 5))

const first = (): Page =>
  pageOf('listScreen', { path: '/orders', load: { screen: 'list.js', parts: [], styles: [], error: '' } })
const next = (more: Partial<Page> = {}): Page =>
  pageOf('orderScreen', {
    path: '/orders/7',
    params: { id: '7' },
    load: { screen: 'order.js', parts: [], styles: [], error: '' },
    ...more,
  })

test('[32-5] a move asks for the next screen in one request, loads the files that the page does not hold, shows the screen, and adds a step to the history', async () => {
  const at = world({ '/orders/7': next() })
  const page = livingPage(first(), [list], at.reach)
  let drawn = 0
  page.listen(() => {
    drawn += 1
  })
  page.goTo('/orders/7')
  await settled()
  assert.deepEqual(at.asked, ['/_t/screen?path=%2Forders%2F7&version=v1'])
  assert.deepEqual(at.loaded, [['order.js']])
  assert.deepEqual(at.gone, [])
  assert.deepEqual(at.steps, ['/orders', '/orders/7'])
  assert.equal(page.page.screen, 'orderScreen')
  assert.equal(page.screen()?.name, 'orderScreen')
  assert.deepEqual(page.page.params, { id: '7' })
  // The new screen starts with its own state, and holds none of the screen before.
  assert.deepEqual(page.state, { open: false })
  assert.ok(drawn >= 1)
  // The page is at its top, and the focus goes to the heading of the new screen.
  assert.deepEqual(at.arrived, [{}])
})

test('[32-5] going back shows the screen before with no file loaded twice, and a move with replace adds no step', async () => {
  const at = world({
    '/orders/7': next(),
    '/orders': first(),
    '/orders?tab=paid': { ...first(), state: { tab: 'paid' } },
  })
  const page = livingPage(first(), [list], at.reach)
  page.goTo('/orders/7')
  await settled()
  at.goBack()
  await settled()
  assert.equal(page.page.screen, 'listScreen')
  assert.deepEqual(at.steps, ['/orders'])
  assert.deepEqual(at.loaded, [['order.js']])
  // Going back puts the page where it was: it is not sent to its top.
  assert.deepEqual(at.arrived, [{}, { back: true }])
  page.goTo('/orders?tab=paid', { replace: true })
  await settled()
  assert.deepEqual(at.steps, ['/orders?tab=paid'])
  assert.equal(page.state.tab, 'paid')
  // A step back that changes only the state of the address asks for no screen.
  const asked = at.asked.length
  page.set({ tab: 'all' })
  assert.equal(at.asked.length, asked)
})

test('[32-5] an answer that sends the visitor on is followed, an address that the page leaves for is loaded whole, and so is a screen that may be framed by another than the one the document was loaded for', async () => {
  const at = world({
    '/secret': { goTo: '/sign-in?back=%2Fsecret' },
    '/sign-in?back=%2Fsecret': pageOf('signIn', {
      path: '/sign-in',
      load: { screen: 'order.js', parts: [], styles: [], error: '' },
    }),
    '/api/thing': { leave: '/api/thing' },
    '/framed': next({ framedBy: 'anyone' }),
  })
  const page = livingPage(first(), [list], at.reach)
  page.goTo('/secret')
  await settled()
  assert.equal(page.page.screen, 'signIn')
  assert.deepEqual(at.steps, ['/orders', '/sign-in?back=%2Fsecret'])
  page.goTo('/api/thing')
  await settled()
  assert.deepEqual(at.gone, ['/api/thing'])
  page.goTo('/framed')
  await settled()
  assert.deepEqual(at.gone, ['/api/thing', '/framed'])
  // An address that the engine cannot answer is loaded whole, so the engine shows what it shows for it.
  page.goTo('/unknown')
  await settled()
  assert.deepEqual(at.gone, ['/api/thing', '/framed', '/unknown'])
})

test('[32-5] a move to a place on the screen that is shown asks for nothing: the page goes to that element, and with keep a move leaves the page where it was', async () => {
  const at = world({ '/orders/7': next() })
  const page = livingPage(first(), [list], at.reach)
  page.goTo('#prices')
  await settled()
  assert.deepEqual(at.asked, [])
  assert.deepEqual(at.arrived, [{ place: 'prices' }])
  page.goTo('/orders/7', { keep: true })
  await settled()
  assert.deepEqual(at.arrived, [{ place: 'prices' }, { keep: true }])
  // An address that ends in a place goes to the screen and then to the place.
  page.goTo('/orders/7#total')
  await settled()
  assert.deepEqual(at.arrived.at(-1), { place: 'total' })
})

test('[32-5] the style files of the screen before stay in the page until the next screen is drawn, and the new ones stand before it', async () => {
  const at = world({ '/orders/7': next({ load: { screen: 'order.js', parts: [], styles: ['order.css'], error: '' } }) })
  const seen: string[] = []
  at.reach.styles = async (files) => {
    seen.push(`added ${files.join(' ')}`)
    return () => void seen.push('dropped the old')
  }
  const page = livingPage(
    pageOf('listScreen', { path: '/orders', load: { screen: 'list.js', parts: [], styles: ['list.css'], error: '' } }),
    [list],
    at.reach,
  )
  page.listen(() => {
    if (page.screen()?.name === 'orderScreen' && !seen.includes('drawn')) seen.push('drawn')
  })
  page.goTo('/orders/7')
  await settled()
  assert.deepEqual(seen, ['added order.css', 'drawn', 'dropped the old'])
})

test('[31-6] a page with no way to ask for a screen loads the address of a move whole', () => {
  const gone: string[] = []
  const page = livingPage(first(), [list], {
    post: async () => ({ ok: true, value: null }),
    go: (address) => void gone.push(address),
  })
  page.goTo('/orders/7')
  assert.deepEqual(gone, ['/orders/7'])
})
