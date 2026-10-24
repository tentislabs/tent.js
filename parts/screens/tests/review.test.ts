import assert from 'node:assert/strict'
import { test } from 'node:test'
import { change, day, number, project, message } from '../../core/index.ts'
import { describe } from '../../core/internal.ts'
import { createElement as h } from '../borrowed/react.ts'
import { component, Form, screen, useField } from '../index.ts'
import { livingPage } from '../page/alive.ts'
import { follow } from '../page/press.ts'
import type { Reach } from '../page/reach.ts'
import type { Page } from '../page/types.ts'
import { workedOut } from '../page/worked.ts'
import { described, drawingOf, drawn, pageOf, unescaped } from './drawn.ts'

/** Lets what a page started come to its end. */
const settled = () => new Promise((done) => setTimeout(done, 5))

test('[44-7] a change shown before it is answered fits a row to a query by the rules of the store: a text filter does not count capitals of the plain letters', () => {
  const plans = {
    changes: {
      addGuest: { writes: [{ add: 'guests', values: { name: { input: 'name' } } }], defaults: { guests: {} } },
    },
    queries: {
      startingAnn: { plan: { from: 'guests', where: { col: 'name', startsWith: 'ann' } } },
      holdingAnn: { plan: { from: 'guests', where: { col: 'name', contains: 'ANN' } } },
    },
  }
  const worked = workedOut(plans, 'addGuest', { name: 'Ann' }, undefined)
  assert.ok(worked, 'the plans hold the change')
  // The engine answers both queries with the row that the change adds, as `matches` of core judges a filter.
  for (const result of worked.results) {
    const shown = result.to([], { name: 'Ann' }, {})
    assert.ok(Array.isArray(shown), result.what)
    assert.deepEqual(
      shown.map((row) => Object(row).name),
      ['Ann'],
      `${result.what} shows the row that the engine will add`,
    )
  }
})

test('[31-15] an action that states refresh is asked again on its timer while its screen is shown, and no more once the page moved to another screen', async () => {
  const sent: string[] = []
  // The timers that stand: a page may take one back, by what `every` answers, or let it come round and ask nothing.
  const timers = new Set<() => void>()
  const other: Page = pageOf('otherScreen', {
    path: '/other',
    load: { screen: 'browser/screens.other.js', parts: [], styles: ['browser/styles.css'], error: '' },
  })
  const reach: Reach = {
    post: async (address) => {
      sent.push(address)
      return { ok: true, value: 2 }
    },
    go: () => undefined,
    get: async () => ({ ok: true, value: other }),
    load: async () => [{ name: 'otherScreen', kind: 'screen' }],
    moved: () => undefined,
    every: (work) => {
      timers.add(work)
      return () => timers.delete(work)
    },
  }
  const came = [{ what: 'rates', input: { base: 'USD' }, entry: 'rates', value: 1 }]
  const page = livingPage(
    pageOf('ratesScreen', { path: '/rates', answers: came }),
    [{ name: 'ratesScreen', kind: 'screen' }],
    reach,
  )
  page.ask('rates', { base: 'USD' }, { entry: 'rates', every: 600000, kind: 'action' })
  assert.equal(timers.size, 1)
  page.goTo('/other')
  await settled()
  assert.equal(page.page.screen, 'otherScreen', 'the page moved')
  sent.length = 0
  // Every timer that still stands comes round: the engine is asked nothing of the action of a screen not shown.
  for (const work of timers) work()
  await settled()
  assert.deepEqual(sent, [])
})

test('[31-8] a state of a component starts as the default of its type as a state of a screen does: a day of today is the day of today', async () => {
  const Since = component('Since', {
    state: { from: day({ default: 'today' }) },
    view: ({ state }) => h('p', null, typeof state.from === 'string' ? state.from : 'no day'),
  })
  const shown = screen('shown', { path: '/shown', access: 'anyone', view: () => null })
  const description = described([Since, shown])
  const made = await drawn(description, 'shown', { views: { shown: { name: 'shown', view: () => h(Since, {}) } } })
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  assert.equal(drawingOf(made.html), `<p>${today}</p>`)
})

test('[31-8] over https the page writes the cookie of the device states under a name that starts __Host-', () => {
  const written: string[] = []
  const reach: Reach = {
    post: async () => ({ ok: true }),
    go: () => undefined,
    app: 'shop',
    cookie: { get: () => undefined, set: (name) => void written.push(name) },
  }
  const record = {
    name: 'shown',
    kind: 'screen' as const,
    state: { mode: { type: { kind: 'choice', values: ['light', 'dark'], default: 'light' }, in: 'device' } },
  }
  const page = livingPage(pageOf('shown', { origin: 'https://shop.example' }), [record], reach)
  page.set({ mode: 'dark' }, { press: true })
  assert.deepEqual(written, ['__Host-tent_state.shop'])
})

test('[32-5] then takes above beside its goTo: the screen it goes to is opened above the one that is shown', () => {
  const moves: { address: string; above?: boolean }[] = []
  const living = livingPage(pageOf('shown'), [{ name: 'shown', kind: 'screen' }], {
    post: async () => ({ ok: true }),
    go: () => undefined,
  })
  const store = {
    ...living,
    goTo: (address: string, o?: { above?: boolean }) => void moves.push({ address, above: o?.above }),
  }
  follow(store, { goTo: '/orders', above: true }, undefined, () => undefined)
  assert.deepEqual(moves, [{ address: '/orders', above: true }])
})

test('[32-1] the label and the help of a type that are a word are written by useField in the language of the page', async () => {
  const rate = change('rateWorded', {
    access: 'anyone',
    input: { stars: number({ label: message('rate.stars'), help: message('rate.help') }) },
    run: () => null,
  })
  const coded = screen('coded', { path: '/coded', access: 'anyone', view: () => null })
  const made = describe({
    definitions: [{ value: project('shop', { currency: 'USD' }) }, { value: rate }, { value: coded }],
    messages: { en: { 'rate.stars': 'Stars given', 'rate.help': 'From one to five' } },
  })
  assert.deepEqual(made.findings, [])
  function Told() {
    const field = useField('stars')
    return h('output', null, `${field.label} / ${field.help ?? ''}`)
  }
  const view = () => h(Form, { call: { definition: 'rateWorded', kind: 'change' } }, h(Told))
  const html = (await drawn(made.description, 'coded', { views: { coded: { name: 'coded', kind: 'screen', view } } }))
    .html
  const told = /<output>([^<]*)<\/output>/.exec(drawingOf(html))?.[1]
  assert.equal(unescaped(told ?? ''), 'Stars given / From one to five')
})

test('[32-8] the built-in screen of an address that is not found says the words of the engine\'s own page, "This page could not be found.", and a language file gives it anew under tent.notFound.title', async () => {
  const shown = screen('shown', { path: '/shown', access: 'anyone', view: () => null })
  const english = await drawn(described([shown]), 'tent.notFound', { page: { status: 404 } })
  assert.match(drawingOf(english.html), /This page could not be found\./)
  const made = describe({
    definitions: [{ value: project('shop', { languages: ['en', 'tr'] }) }, { value: shown }],
    messages: { en: {}, tr: { 'tent.notFound.title': 'Bu sayfa bulunamadı.' } },
  })
  const turkish = await drawn(made.description, 'tent.notFound', {
    page: { status: 404, language: 'tr', languages: ['en', 'tr'] },
  })
  assert.match(unescaped(drawingOf(turkish.html)), /Bu sayfa bulunamadı\./)
})
