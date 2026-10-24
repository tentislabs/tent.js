import assert from 'node:assert/strict'
import { test } from 'node:test'
import { choice } from '../../core/index.ts'
import type { Page } from '../draw.ts'
import { createElement } from '../borrowed/react.ts'
import { Link, screen } from '../index.ts'
import { described, drawingOf, drawn, unescaped } from './drawn.ts'

const view = () => null
const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'anyone',
  state: { tab: { type: choice(['open', 'paid', 'all'], { default: 'open' }), in: 'address' } },
  view,
})
const orderScreen = screen('orderScreen', { path: '/orders/:id', access: 'anyone', view })
const homeScreen = screen('homeScreen', { path: '/', access: 'anyone', view })
const description = described([ordersScreen, orderScreen, homeScreen])

/** Draws the screen of a page whose view is the one function, and answers its drawing as a browser reads it. */
async function linked(name: string, page: Partial<Page>, view: () => unknown): Promise<string> {
  const made = await drawn(description, name, {
    page: { languages: ['en', 'tr'], ...page },
    views: { [name]: { name, kind: 'screen', view } },
  })
  return unescaped(drawingOf(made.html))
}

/** The `<a>` that a drawing holds with an id, as it was written. */
function anchor(drawing: string, id: string): string {
  const found = new RegExp(`<a [^>]*id="${id}"[^>]*>`).exec(drawing)
  assert.ok(found, `no link ${id} in ${drawing}`)
  return found[0]
}

const current = (drawing: string, id: string): boolean => anchor(drawing, id).includes('aria-current="page"')

test('[30-2] a Link is one <a> with the address of to and with, in the language of the page, and every other property of the anchor reaches it', async () => {
  const view = () =>
    createElement(
      'nav',
      null,
      createElement(
        Link,
        { id: 'one', to: orderScreen, with: { id: '7' }, className: 'card', style: { color: 'red' } },
        'Seven',
      ),
      createElement(Link, { id: 'path', to: '/orders/8' }, 'Eight'),
      createElement(Link, { id: 'place', to: '#prices' }, 'Prices'),
      createElement(Link, { id: 'state', to: ordersScreen, with: { tab: 'paid' } }, 'Paid'),
    )
  const english = await linked('homeScreen', { path: '/' }, view)
  assert.match(anchor(english, 'one'), /href="\/orders\/7"/)
  assert.match(anchor(english, 'one'), /class="card"/)
  assert.match(anchor(english, 'one'), /style="color:red"/)
  assert.match(english, /<a [^>]*id="one"[^>]*>Seven<\/a>/)
  assert.match(anchor(english, 'path'), /href="\/orders\/8"/)
  assert.match(anchor(english, 'place'), /href="#prices"/)
  // The state that a screen keeps in its address stands after the question mark.
  assert.match(anchor(english, 'state'), /href="\/orders\?tab=paid"/)
  // On a page in another language every path of the app is written in it.
  const turkish = await linked('homeScreen', { path: '/', language: 'tr' }, view)
  assert.match(anchor(turkish, 'one'), /href="\/tr\/orders\/7"/)
  assert.match(anchor(turkish, 'path'), /href="\/tr\/orders\/8"/)
  assert.match(anchor(turkish, 'place'), /href="#prices"/)
  // Nothing of the framework's own is written on the element but its address and whether it is current.
  assert.doesNotMatch(english, /data-t-|tb-/)
})

test('[30-2] a Link is current on its own screen and on an address under it, with exact on its own alone, and nothing but / lies under /', async () => {
  const view = () =>
    createElement(
      'nav',
      null,
      createElement(Link, { id: 'orders', to: ordersScreen }, 'Orders'),
      createElement(Link, { id: 'exact', to: ordersScreen, exact: true }, 'Orders alone'),
      createElement(Link, { id: 'seven', to: orderScreen, with: { id: '7' } }, 'Seven'),
      createElement(Link, { id: 'eight', to: orderScreen, with: { id: '8' } }, 'Eight'),
      createElement(Link, { id: 'home', to: homeScreen }, 'Home'),
    )
  const under = await linked('orderScreen', { path: '/orders/7', params: { id: '7' } }, view)
  assert.deepEqual(
    ['orders', 'exact', 'seven', 'eight', 'home'].map((id) => current(under, id)),
    [true, false, true, false, false],
  )
  const own = await linked('ordersScreen', { path: '/orders' }, view)
  assert.deepEqual(
    ['orders', 'exact', 'seven', 'home'].map((id) => current(own, id)),
    [true, true, false, false],
  )
  const root = await linked('homeScreen', { path: '/' }, view)
  assert.deepEqual(
    ['orders', 'home'].map((id) => current(root, id)),
    [false, true],
  )
})

test('[30-2] of three tabs that are links with a with, the one whose values are shown is current, and a path held without its language code', async () => {
  const view = () =>
    createElement(
      'nav',
      null,
      createElement(Link, { id: 'open', to: ordersScreen, with: { tab: 'open' } }, 'Open'),
      createElement(Link, { id: 'paid', to: ordersScreen, with: { tab: 'paid' } }, 'Paid'),
      createElement(Link, { id: 'all', to: ordersScreen, with: { tab: 'all' } }, 'All'),
    )
  for (const [tab, language] of [
    ['paid', 'en'],
    ['all', 'tr'],
    ['open', 'en'],
  ]) {
    const drawing = await linked('ordersScreen', { path: '/orders', language, state: { tab } }, view)
    assert.deepEqual(
      ['open', 'paid', 'all'].filter((id) => current(drawing, id)),
      [tab],
      `${tab} in ${language}`,
    )
  }
})

test('[30-2] a Link with language alone shows this screen in that language, and is current while the page is in it', async () => {
  const view = () =>
    createElement(
      'nav',
      null,
      createElement(Link, { id: 'en', language: 'en' }, 'English'),
      createElement(Link, { id: 'tr', language: 'tr' }, 'Türkçe'),
      createElement(Link, { id: 'other', to: orderScreen, with: { id: '7' }, language: 'tr' }, 'Seven'),
    )
  const english = await linked('orderScreen', { path: '/orders/7', params: { id: '7' } }, view)
  assert.match(anchor(english, 'en'), /href="\/orders\/7"/)
  assert.match(anchor(english, 'tr'), /href="\/tr\/orders\/7"/)
  assert.deepEqual([current(english, 'en'), current(english, 'tr')], [true, false])
  // Beside `to` it goes to that screen in that language, and is current only where the page is in it.
  assert.match(anchor(english, 'other'), /href="\/tr\/orders\/7"/)
  assert.equal(current(english, 'other'), false)
  const turkish = await linked('orderScreen', { path: '/orders/7', params: { id: '7' }, language: 'tr' }, view)
  assert.deepEqual([current(turkish, 'en'), current(turkish, 'tr'), current(turkish, 'other')], [false, true, true])
})

test('[30-3] each row of the address rules is held for a Link: a path that leads to another site, written or worked out, draws no link', async () => {
  const wrong = ['/\\evil.example', '/\t/evil.example', '/a//evil.example', '//evil.example', '/%2F%2Fevil.example']
  const view = () =>
    createElement(
      'nav',
      null,
      ...wrong.map((to, place) => createElement(Link, { key: to, id: `wrong${place}`, to: `/${to.slice(1)}` }, 'Go')),
      createElement(Link, { id: 'right', to: `/orders/${'7'}` }, 'Go'),
    )
  const drawing = await linked('homeScreen', { path: '/' }, view)
  for (const [place, to] of wrong.entries())
    assert.doesNotMatch(anchor(drawing, `wrong${place}`), /href=/, JSON.stringify(to))
  assert.match(anchor(drawing, 'right'), /href="\/orders\/7"/)
  assert.doesNotMatch(drawing, /evil\.example/)
})
