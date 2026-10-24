import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deviceRead, deviceText } from '../../core/internal.ts'
import { livingPage } from '../page/alive.ts'
import type { Reach } from '../page/reach.ts'
import type { ViewRecord } from '../page/types.ts'
import { pageOf } from './drawn.ts'

/** What stands for a browser in these tests: its address, its history, its cookies and its own store. */
function browser(search = '') {
  const steps: string[] = [search]
  const cookies = new Map<string, string>()
  const kept = new Map<string, string>()
  let back: (() => void) | undefined
  const reach: Reach = {
    app: 'shop',
    post: async () => ({ ok: true, value: null }),
    go: () => {},
    shows: () => `/desk${steps.at(-1) ? `?${steps.at(-1)}` : ''}`,
    address: (written, step) => {
      if (step) steps.push(written)
      else steps[steps.length - 1] = written
    },
    cookie: {
      get: (name) => cookies.get(name),
      set: (name, value) => {
        if (value === '') cookies.delete(name)
        else cookies.set(name, value)
      },
    },
    kept: { get: (key) => kept.get(key), set: (key, value) => void kept.set(key, value) },
    back: (heard) => {
      back = heard
    },
  }
  return {
    reach,
    steps,
    cookies,
    kept,
    // The back button: the browser shows the address before, and tells the page.
    goBack: () => {
      steps.pop()
      back?.()
    },
  }
}

const desk: ViewRecord = {
  name: 'deskScreen',
  kind: 'screen',
  shared: {
    mode: { type: { kind: 'choice', values: ['auto', 'light', 'dark'], default: 'auto' }, in: 'device' },
    cart: { type: { kind: 'list', of: { kind: 'text' } }, in: 'browser' },
  },
  state: {
    tab: { type: { kind: 'choice', values: ['open', 'paid'], default: 'open' }, in: 'address', back: true },
    page: {
      type: { kind: 'number', min: 1, max: 500, whole: true, default: 1 },
      in: 'address',
      back: true,
      reset: ['tab', 'search'],
    },
    search: { type: { kind: 'text', default: '' }, in: 'address' },
    tags: { type: { kind: 'list', of: { kind: 'text' } }, in: 'address' },
    seen: { type: { kind: 'boolean' }, in: 'device' },
    draft: { type: { kind: 'text', optional: true }, in: 'browser' },
    open: { kind: 'boolean' },
  },
}

const alive = (
  at: ReturnType<typeof browser>,
  state: Record<string, unknown> = {},
  user?: { id: string; roles: string[] },
) => {
  const page = livingPage(pageOf('deskScreen', { path: '/desk', state, ...(user ? { user } : {}) }), [desk], at.reach)
  // The page was drawn over the first HTML: from then on it holds what the browser kept.
  page.drawn()
  return page
}

test('[31-8] set on address state replaces the address, a default is left out, and a list is written once for each entry', () => {
  const at = browser('utm=mail')
  const page = alive(at)
  let drawn = 0
  page.listen(() => {
    drawn += 1
  })
  page.set({ search: 'lamp', tags: ['red', 'new'] })
  assert.deepEqual([page.state.search, page.state.tags], ['lamp', ['red', 'new']])
  // What the address held of another kind stays, and no step is added.
  assert.deepEqual(at.steps, ['utm=mail&search=lamp&tags=red&tags=new'])
  assert.equal(drawn, 1)
  page.set({ search: '' })
  assert.deepEqual(at.steps, ['utm=mail&tags=red&tags=new'])
  // A set that changes nothing writes nothing and draws nothing.
  page.set({ search: '' })
  assert.equal(drawn, 2)
  // A state that lives in the page is in no address.
  page.set({ open: true })
  assert.equal(page.state.open, true)
  assert.deepEqual(at.steps, ['utm=mail&tags=red&tags=new'])
})

test('[31-8] with back: true a change that a press makes adds a step, the back button undoes it, and typing adds none', () => {
  const at = browser()
  const page = alive(at)
  page.set({ tab: 'paid' }, { press: true })
  page.set({ page: 3 }, { press: true })
  assert.deepEqual(at.steps, ['', 'tab=paid', 'tab=paid&page=3'])
  // What a field changes while a person types adds no step, also for a state that says `back: true`.
  page.set({ page: 4 })
  assert.deepEqual(at.steps, ['', 'tab=paid', 'tab=paid&page=4'])
  at.goBack()
  assert.deepEqual([page.state.tab, page.state.page], ['paid', 1])
  at.goBack()
  assert.deepEqual([page.state.tab, page.state.page], ['open', 1])
})

test('[31-8] a state with reset goes back to its default when set changes a state it names, in the same step, and keeps its value when the back button changes that state', () => {
  const at = browser('page=7')
  const page = alive(at, { page: 7 })
  assert.equal(page.state.page, 7)
  page.set({ tab: 'paid' }, { press: true })
  assert.deepEqual([page.state.tab, page.state.page], ['paid', 1])
  assert.deepEqual(at.steps, ['page=7', 'tab=paid'])
  // The back button sets every state as the address writes it: the page number is the one of that step.
  at.goBack()
  assert.deepEqual([page.state.tab, page.state.page], ['open', 7])
  // A `set` that gives the state too wins over the reset.
  page.set({ tab: 'paid', page: 3 }, { press: true })
  assert.deepEqual([page.state.tab, page.state.page], ['paid', 3])
  // A value that is worked out is held to its type.
  page.set({ page: 9000 })
  assert.equal(page.state.page, 500)
  page.set({ tab: 'gone' })
  assert.equal(page.state.tab, 'paid')
})

test('[31-8] a device state is kept in the one cookie of the app, a state of the project under its name and a state of a screen under the name of the screen, and one at its default is left out', () => {
  const at = browser()
  const page = alive(at)
  page.set({ mode: 'dark' })
  assert.deepEqual(deviceRead(at.cookies.get('tent_state.shop') ?? ''), { mode: 'dark' })
  page.set({ seen: true })
  assert.deepEqual(deviceRead(at.cookies.get('tent_state.shop') ?? ''), { mode: 'dark', 'deskScreen.seen': true })
  page.set({ mode: 'auto', seen: false })
  assert.equal(at.cookies.has('tent_state.shop'), false)
  // What the cookie holds of another screen stays as it is.
  at.cookies.set('tent_state.shop', deviceText({ 'otherScreen.closed': true }))
  alive(at).set({ seen: true })
  assert.deepEqual(deviceRead(at.cookies.get('tent_state.shop') ?? ''), {
    'otherScreen.closed': true,
    'deskScreen.seen': true,
  })
})

test('[31-8] a state kept in the browser is put in when the page comes alive, is kept for the caller who set it, and a kept value that no longer fits its type is the default', () => {
  const at = browser()
  const ann = { id: 'u1', roles: [] }
  const page = alive(at, {}, ann)
  // The first HTML does not know it: the page starts with the default.
  assert.equal(page.state.draft, undefined)
  page.set({ draft: 'Dear all', cart: ['a', 'b'] })
  assert.deepEqual([...at.kept.keys()], ['tent_state.shop.u1'])
  // The same user at this browser is shown it again, a state of the project and one of the screen.
  const again = alive(at, {}, ann)
  assert.deepEqual([again.state.draft, again.state.cart], ['Dear all', ['a', 'b']])
  // The next user of this browser is not, and neither is a visitor.
  assert.equal(alive(at, {}, { id: 'u2', roles: [] }).state.draft, undefined)
  const visitor = alive(at)
  assert.equal(visitor.state.draft, undefined)
  visitor.set({ draft: 'A visitor' })
  assert.deepEqual([...at.kept.keys()].sort(), ['tent_state.shop.', 'tent_state.shop.u1'])
  assert.equal(alive(at, {}, ann).state.draft, 'Dear all')
  // A kept value that no longer fits its type is taken as the default, and what is no record at all as nothing.
  at.kept.set('tent_state.shop.u1', JSON.stringify({ 'deskScreen.draft': 7, cart: ['c'] }))
  const misfit = alive(at, {}, ann)
  assert.deepEqual([misfit.state.draft, misfit.state.cart], [undefined, ['c']])
  at.kept.set('tent_state.shop.u1', 'no json')
  assert.equal(alive(at, {}, ann).state.cart, undefined)
})

test('[31-8] a page with no browser behind it keeps its state in the page alone', () => {
  const page = livingPage(pageOf('deskScreen', { path: '/desk' }), [desk], {
    post: async () => ({ ok: true, value: null }),
    go: () => {},
  })
  page.set({ tab: 'paid', mode: 'dark', draft: 'x' }, { press: true })
  assert.deepEqual([page.state.tab, page.state.mode, page.state.draft], ['paid', 'dark', 'x'])
})
