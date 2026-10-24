import assert from 'node:assert/strict'
import { test } from 'node:test'
import { action, asset, boolean, choice, json, list, number, object, project, query, role, text } from '../index.ts'
import type { Loaded } from '../internal.ts'
import { checkDescription, describe, mark, record } from '../internal.ts'

const shop = project('shop', {})
const openOrders = query('openOrders', { access: 'signedIn', input: { limit: number({ default: 50 }) }, run: () => [] })
const rates = action('rates', { access: 'signedIn', run: async () => 1 })
const view = () => null

/** A screen and a component as their words make them: a record that carries the options. */
const screen = (name: string, options: object) => record('screen', name, options)
const component = (name: string, options: object) => record('component', name, options)
/** An entry of `data` as `read` answers it. */
const read = (what: string, more: object = {}) => mark({ read: what, ...more })

/** Describes definitions, each with what the build read of its arrows, by its name. */
function described(definitions: object[], views: Record<string, Record<string, object>> = {}) {
  const loaded: Loaded[] = definitions.map((value) => {
    const name = String(Reflect.get(value, 'definition'))
    return Object.hasOwn(views, name) ? { value, views: views[name] } : { value }
  })
  const { description, findings } = describe({ definitions: loaded })
  return { description, found: findings.map((one) => `${one.code} ${one.message}`) }
}

const codesOf = (found: string[]): string[] => found.map((one) => one.slice(0, 5)).sort()

test('[11-1@5] describe stores a screen with every option as the format gives it, with the components that the build saw its view draw', () => {
  const ordersScreen = screen('ordersScreen', {
    path: '/orders/:id',
    view,
    access: role('staff'),
    title: 'Open orders',
    about: 'The desk',
    data: { orders: read('openOrders', { input: { limit: 50, filter: { open: true } }, needed: true }) },
    state: {
      tab: { type: choice(['open', 'paid'], { default: 'open' }), in: 'address', back: true },
      page: { type: number({ default: 1 }), in: 'address', reset: ['tab'] },
      wide: { type: boolean(), in: 'device' },
      search: text({ default: '' }),
    },
    layout: component('AppShell', { view }),
    loading: 'Spinner',
    cache: { for: '5 minutes', public: true },
    server: false,
    seo: {
      description: 'Orders',
      image: asset('desk.png'),
      index: false,
      data: { '@type': 'Thing' },
      addresses: read('openOrders'),
    },
    head: [{ meta: { name: 'robots', content: 'noindex' } }],
    offer: ['mcp'],
    framedBy: ['https://studio.example.com'],
    was: 'desk',
  })
  const { description, found } = described(
    [shop, openOrders, rates, ordersScreen, component('AppShell', { view }), component('Spinner', { view })],
    { ordersScreen: { uses: ['Empty', 'PriceTag'] } },
  )
  assert.deepEqual(found, [])
  assert.deepEqual(description.screens.ordersScreen, {
    path: '/orders/:id',
    access: { rule: 'role', role: 'staff' },
    title: 'Open orders',
    about: 'The desk',
    data: {
      orders: { query: 'openOrders', input: { limit: 50, filter: { object: [['open', true]] } }, needed: true },
    },
    state: {
      tab: { type: { kind: 'choice', values: ['open', 'paid'], default: 'open' }, in: 'address', back: true },
      page: { type: { kind: 'number', default: 1 }, in: 'address', reset: ['tab'] },
      wide: { type: { kind: 'boolean' }, in: 'device' },
      search: { kind: 'text', default: '' },
    },
    // The components it draws, in the order of their names: those the build saw, and the two that its options name.
    uses: ['AppShell', 'Empty', 'PriceTag', 'Spinner'],
    layout: 'AppShell',
    loading: 'Spinner',
    cache: { for: 300000, public: true },
    server: false,
    seo: {
      description: 'Orders',
      image: { asset: 'desk.png' },
      index: false,
      data: { object: [['@type', 'Thing']] },
      addresses: { query: 'openOrders' },
    },
    head: [{ meta: { name: 'robots', content: 'noindex' } }],
    offer: ['mcp'],
    framedBy: ['https://studio.example.com'],
    was: ['desk'],
  })
  assert.deepEqual(checkDescription(description), [])
})

test('[11-1@5] describe stores a component with every option, and what equals what holds when it is left out is left out', () => {
  const PriceTag = component('PriceTag', {
    view,
    props: { amount: number(), currency: text({ default: 'USD' }) },
    data: { rate: read('rates', { wait: false, refresh: '10 minutes' }) },
    state: { open: boolean(), draft: { type: json({ optional: true }), in: 'browser' } },
    layout: 'AppShell',
    browser: false,
    was: ['Price'],
  })
  const lean = screen('lean', {
    for: 'notFound',
    view,
    access: 'anyone',
    cache: '1 minute',
    seo: { index: true },
    data: {},
    state: {},
    offer: [],
  })
  const { description, found } = described([shop, rates, PriceTag, component('AppShell', { view }), lean])
  assert.deepEqual(found, [])
  assert.deepEqual(description.components.PriceTag, {
    props: { amount: { kind: 'number' }, currency: { kind: 'text', default: 'USD' } },
    data: { rate: { action: 'rates', wait: false, refresh: 600000 } },
    state: { open: { kind: 'boolean' }, draft: { type: { kind: 'json', optional: true }, in: 'browser' } },
    uses: ['AppShell'],
    layout: 'AppShell',
    browser: false,
    was: ['Price'],
  })
  // A view is code: the description holds none of it.
  assert.deepEqual(description.components.AppShell, {})
  assert.deepEqual(description.screens.lean, {
    for: 'notFound',
    access: { rule: 'anyone', why: '' },
    cache: 60000,
  })
  assert.deepEqual(checkDescription(description), [])
})

test('[11-1@5] an arrow of a screen is stored as what the build read of it, and as code where it read none', () => {
  const arrows = {
    path: '/p/:id',
    view,
    access: 'anyone',
    data: () => ({}),
    title: () => 'x',
    seo: { description: () => 'x', image: () => 'x', data: () => ({}) },
  }
  const read = {
    data: {
      product: { read: 'openOrders', input: { id: { name: ['params', 'id'] } }, needed: true },
      more: { read: 'rates', wait: false },
    },
    title: { name: ['product', 'name'] },
    'seo.description': { text: ['About ', { name: ['product', 'name'] }] },
    'seo.image': { name: ['product', 'photo'] },
    'seo.data': { object: [['name', { name: ['product', 'name'] }]] },
  }
  const both = described(
    [shop, openOrders, rates, screen('readScreen', arrows), screen('codeScreen', { ...arrows, path: '/c' })],
    {
      readScreen: read,
      codeScreen: { uses: ['OrderCard', 'PriceTag'] },
    },
  )
  assert.deepEqual(both.found, [])
  const { readScreen, codeScreen } = both.description.screens
  assert.deepEqual(readScreen.data, {
    product: { query: 'openOrders', input: { id: { name: ['params', 'id'] } }, needed: true },
    more: { action: 'rates', wait: false },
  })
  assert.deepEqual(readScreen.title, { name: ['product', 'name'] })
  assert.deepEqual(readScreen.seo, {
    description: { text: ['About ', { name: ['product', 'name'] }] },
    image: { name: ['product', 'photo'] },
    data: { object: [['name', { name: ['product', 'name'] }]] },
  })
  // An arrow that the build read none of is stored as code, beside what the build saw the view draw.
  assert.deepEqual(codeScreen, {
    path: '/c',
    access: { rule: 'anyone', why: '' },
    data: { code: true },
    title: { code: true },
    seo: { description: { code: true }, image: { code: true }, data: { code: true } },
    uses: ['OrderCard', 'PriceTag'],
  })
  assert.deepEqual(checkDescription(both.description), [])
  // Each arrow alone is code where the build read none of it, and nothing else of the screen is.
  for (const option of ['data', 'title'] as const) {
    const one = described([shop, screen('s', { path: '/s', view, access: 'anyone', [option]: arrows[option] })])
    assert.deepEqual(one.description.screens.s[option], { code: true }, option)
    assert.deepEqual(Object.keys(one.description.screens.s).sort(), ['access', option, 'path'].sort(), option)
  }
})

test('[11-1@5] describe refuses an unknown option of screen and of component with the nearest real one, a required one that is left out, and two forms at once', () => {
  const unknown = described([
    shop,
    screen('a', { path: '/a', view, access: 'anyone', titel: 'A' }),
    component('B', { view, prop: {} }),
  ])
  assert.deepEqual(unknown.found, [
    'T1003 a: screen has no option `titel`. The nearest one is `title`.',
    'T1003 B: component has no option `prop`. The nearest one is `props`.',
  ])
  assert.deepEqual(codesOf(described([shop, screen('a', { path: '/a', access: 'anyone' })]).found), ['T1008'])
  assert.deepEqual(codesOf(described([shop, screen('a', { path: '/a', view })]).found), ['T1008'])
  assert.deepEqual(described([shop, screen('a', { view, access: 'anyone' })]).found, [
    'T1008 a: it states neither `path` nor `for`.',
  ])
  assert.deepEqual(described([shop, screen('a', { path: '/a', for: 'error', view, access: 'anyone' })]).found, [
    'T1007 a: it states `path` and `for` at once.',
  ])
  assert.deepEqual(codesOf(described([shop, component('B', {})]).found), ['T1008'])
  // An unknown name inside a part of a screen is refused the same way.
  const inside = described([
    shop,
    screen('a', { path: '/a', view, access: 'anyone', seo: { descripton: 'x' }, cache: { for: 1000, publik: true } }),
    screen('b', {
      path: '/b',
      view,
      access: 'anyone',
      state: { tab: { type: text({ default: '' }), inn: 'address' } },
    }),
  ])
  assert.deepEqual(inside.found, [
    'T1003 a: cache has no option `publik`. The nearest one is `public`.',
    'T1003 a: seo has no option `descripton`. The nearest one is `description`.',
    'T1003 b: state.tab has no option `inn`. The nearest one is `in`.',
  ])
})

test('[11-1@5] names: a component starts with a capital letter and a screen with a small one, each name stands once, and a name every view is handed is reserved', () => {
  assert.deepEqual(codesOf(described([shop, component('priceTag', { view })]).found), ['T1013'])
  assert.deepEqual(codesOf(described([shop, component('Price_Tag', { view })]).found), ['T1013'])
  assert.deepEqual(codesOf(described([shop, screen('Orders', { path: '/o', view, access: 'anyone' })]).found), [
    'T1013',
  ])
  assert.deepEqual(codesOf(described([shop, component('PriceTag2', { view })]).found), [])
  assert.deepEqual(
    codesOf(described([shop, openOrders, screen('openOrders', { path: '/o', view, access: 'anyone' })]).found),
    ['T1004'],
  )
  const handed = [
    'params',
    'state',
    'user',
    'language',
    'settings',
    'calls',
    'set',
    'above',
    'screen',
    'error',
    'grant',
    'ask',
    'children',
  ]
  for (const name of handed) {
    const found = described([
      shop,
      openOrders,
      screen('a', { path: '/a', view, access: 'anyone', data: { [name]: read('openOrders') } }),
      screen('b', { path: '/b', view, access: 'anyone', state: { [name]: text({ default: '' }) } }),
      component('C', { view, props: { [name]: text() } }),
    ]).found
    assert.deepEqual(codesOf(found), ['T1009', 'T1009', 'T1009'], name)
    assert.match(found[0], new RegExp(`the name \`${name}\` of \`data\` is reserved`))
  }
  // A name of a property or of a state that the format knows is a name like any other.
  assert.deepEqual(described([shop, component('C', { view, props: { use: text(), tag: text() } })]).found, [])
})

test('[11-1@5] a state of a screen and of a component is held: where it is kept, what an address and the cookie can hold, and back', () => {
  const stated = (state: object, word: 'screen' | 'component' = 'screen') =>
    codesOf(
      described([
        shop,
        word === 'screen'
          ? screen('a', { path: '/a', view, access: 'anyone', state })
          : component('A', { view, state }),
      ]).found,
    )
  const any = { optional: true } as const
  assert.deepEqual(stated({ a: { type: text(any), in: 'page' } }), ['T1014'])
  // A json, a file and a vector cannot be kept in the address, also inside a list or an object.
  assert.deepEqual(stated({ a: { type: json(any), in: 'address' } }), ['T1014'])
  assert.deepEqual(stated({ a: { type: list(json(), any), in: 'address' } }), ['T1014'])
  assert.deepEqual(stated({ a: { type: object({ deep: json() }, any), in: 'address' } }), ['T1014'])
  assert.deepEqual(
    stated({
      a: { type: list(text(), any), in: 'address' },
      b: { type: object({ city: text() }, any), in: 'address' },
    }),
    [],
  )
  // The cookie takes a boolean, a choice, a number, or a text with a max of 100 or less.
  assert.deepEqual(stated({ a: { type: text(any), in: 'device' } }), ['T1014'])
  assert.deepEqual(stated({ a: { type: text({ max: 101, optional: true }), in: 'device' } }), ['T1014'])
  assert.deepEqual(stated({ a: { type: list(text(), any), in: 'device' } }), ['T1014'])
  assert.deepEqual(
    stated({
      a: { type: text({ max: 100, default: '' }), in: 'device' },
      b: { type: number({ default: 0 }), in: 'device' },
      c: { type: choice(['x'], { default: 'x' }), in: 'device' },
    }),
    [],
  )
  // A component declares no device state: its screen does.
  assert.deepEqual(stated({ a: { type: boolean(), in: 'device' } }, 'component'), ['T1014'])
  assert.deepEqual(
    stated({ a: { type: boolean(), in: 'browser' }, b: { type: text(any), in: 'address' } }, 'component'),
    [],
  )
  // `back` is for a state that is kept in the address.
  assert.deepEqual(stated({ a: { type: text(any), back: true } }), ['T1014'])
  assert.deepEqual(stated({ a: { type: text(any), in: 'browser', back: true } }), ['T1014'])
  assert.deepEqual(stated({ a: { type: text(any), in: 'address', back: true } }), [])
  assert.deepEqual(stated({ a: 5 }), ['T1014'])
})

test('[11-1@5] a state that is no boolean, states no default and is not optional is refused, by its name', () => {
  const stated = (state: object, word: 'screen' | 'component' = 'screen') =>
    described([
      shop,
      word === 'screen' ? screen('a', { path: '/a', view, access: 'anyone', state }) : component('A', { view, state }),
    ]).found
  // A boolean with no default starts false, and any other type starts as its default or as nothing.
  assert.deepEqual(stated({ open: boolean(), kept: { type: boolean(), in: 'browser' } }), [])
  assert.deepEqual(
    stated({ a: text({ default: '' }), b: number({ optional: true }), c: list(text(), { default: [] }) }),
    [],
  )
  assert.deepEqual(stated({ a: { type: choice(['x', 'y'], { default: 'x' }), in: 'address' } }), [])
  for (const type of [text(), number(), choice(['x', 'y']), list(text()), object({ city: text() }), json()]) {
    for (const word of ['screen', 'component'] as const) {
      const bare = stated({ search: type }, word)
      assert.deepEqual(codesOf(bare), ['T1014'], `${type.kind} of a ${word}`)
      assert.match(bare[0], /`state\.search` is no `boolean`, states no `default` and is not `optional`/)
      assert.deepEqual(codesOf(stated({ search: { type, in: 'browser' } }, word)), ['T1014'], type.kind)
    }
  }
  // A default that is zero or an empty text is a default like any other.
  assert.deepEqual(stated({ a: text({ default: '' }), b: number({ default: 0 }) }), [])
})

test('[11-1@5] a state of the project that is no boolean, states no default and is not optional is refused too, by its name', () => {
  const stated = (state: object) => described([Object.assign(project('shop', {}), { options: { state } })]).found
  assert.deepEqual(stated({ open: boolean(), kept: { type: boolean(), in: 'device' } }), [])
  assert.deepEqual(
    stated({
      a: text({ default: '' }),
      b: number({ optional: true }),
      mode: { type: choice(['x', 'y'], { default: 'x' }), in: 'device' },
    }),
    [],
  )
  for (const type of [text(), number(), choice(['x', 'y']), list(text()), object({ city: text() }), json()]) {
    const bare = stated({ search: type })
    assert.deepEqual(codesOf(bare), ['T1014'], type.kind)
    assert.match(bare[0], /`state\.search` is no `boolean`, states no `default` and is not `optional`/)
    assert.deepEqual(codesOf(stated({ search: { type, in: 'browser' } })), ['T1014'], type.kind)
  }
})

test('[11-1@5] the device states of an app share one cookie: past 3,500 bytes together, over the project and its screens, the project is refused', () => {
  const big = (count: number) =>
    Object.fromEntries(
      Array.from({ length: count }, (_, at) => [
        `s${at}`,
        { type: text({ max: 100, default: '' }), in: 'device' as const },
      ]),
    )
  const app = (ofProject: number, ofScreen: number) =>
    described([
      project('shop', { state: big(ofProject) }),
      screen('a', { path: '/a', view, access: 'anyone', state: big(ofScreen) }),
      screen('b', {
        path: '/b',
        view,
        access: 'anyone',
        state: { tab: { type: text({ default: '' }), in: 'address' } },
      }),
    ]).found
  // The count is of the value of the cookie: the JSON text of the record of the states, each at the largest it
  // could hold, as base64url, which is four bytes for every three. A text of 100 letters may be 400 bytes, and a
  // state of a screen stands under the name of the screen, a dot and its own: six of them fit, and seven do not.
  assert.deepEqual(app(6, 0), [])
  assert.deepEqual(app(0, 6), [])
  assert.deepEqual(app(3, 3), [])
  assert.deepEqual(codesOf(app(7, 0)), ['T1014'])
  assert.deepEqual(codesOf(app(0, 7)), ['T1014'])
  // Seven states of the project: each `"s0":"` and 400 bytes and `"`, six commas and two brackets, 2,857 bytes of
  // JSON, which base64url writes as 3,810.
  assert.match(app(7, 0)[0], /could hold 3810 bytes together/)
  const found = app(4, 3)
  assert.equal(found.length, 1)
  assert.match(
    found[0],
    /^T1014 shop: the states that are kept `in: 'device'` could hold \d+ bytes together, and their one cookie holds 3500\./,
  )
})

test('[11-1@5] an address, a special screen, an entry of data and a line of the head of a screen are held', () => {
  const one = (options: object, projectOptions: object = {}) =>
    described([project('shop', projectOptions), openOrders, screen('a', { view, access: 'anyone', ...options })]).found
  assert.deepEqual(codesOf(one({ path: 'orders' })), ['T1014'])
  // An address under /_t/, and one whose first part is the code of a language of the project, could never be reached.
  assert.deepEqual(codesOf(one({ path: '/_t/mine' })), ['T1014'])
  assert.deepEqual(codesOf(one({ path: '/en/orders' })), ['T1014'])
  assert.deepEqual(codesOf(one({ path: '/tr/orders' }, { languages: ['en', 'tr'] })), ['T1014'])
  assert.deepEqual(one({ path: '/tr/orders' }), [])
  assert.deepEqual(one({ path: '/english' }), [])
  assert.deepEqual(one({ path: '/' }), [])
  assert.deepEqual(codesOf(one({ for: 'lost' })), ['T1014'])
  for (const special of ['notFound', 'error', 'grant', 'ask']) assert.deepEqual(one({ for: special }), [], special)
  // An entry of data is a read, and what it reads is named.
  assert.deepEqual(codesOf(one({ path: '/a', data: { orders: { limit: 5 } } })), ['T1014'])
  assert.deepEqual(codesOf(one({ path: '/a', data: { orders: read('openOrders', { refresh: 'soon' }) } })), ['T1011'])
  assert.deepEqual(codesOf(one({ path: '/a', data: 5 })), ['T1014'])
  assert.deepEqual(codesOf(one({ path: '/a', cache: 'a while' })), ['T1011'])
  // A line of the head takes the names of its kind, and a script comes from a host that was opened.
  assert.deepEqual(codesOf(one({ path: '/a', head: [{ meta: { httpEquiv: 'refresh' } }] })), ['T1014'])
  assert.deepEqual(codesOf(one({ path: '/a', head: [{ script: { src: 'https://js.example.com/a.js' } }] })), ['T1014'])
  assert.deepEqual(
    one(
      { path: '/a', head: [{ script: { src: 'https://js.example.com/a.js' } }] },
      { unlock: { scripts: ['https://js.example.com'] } },
    ),
    [],
  )
  // A view that is no arrow is refused, and so is a function where an option takes none.
  assert.deepEqual(codesOf(one({ path: '/a', view: 'words' })), ['T1014'])
  assert.deepEqual(codesOf(one({ path: '/a', about: () => 'x' })), ['T1014'])
})

test('[11-1@5] the shape of the description holds no tree, no form and no plain of a screen or a component, and no node among the values', () => {
  const { description } = described([shop, screen('a', { path: '/a', view, access: 'anyone' })])
  const withField = (field: object): string[] => {
    const copy = structuredClone(description)
    Object.assign(copy.screens.a, field)
    return checkDescription(copy).map((one) => one.code)
  }
  assert.deepEqual(withField({}), [])
  assert.notDeepEqual(withField({ tree: { block: 'Frame' } }), [])
  assert.notDeepEqual(withField({ form: 'plain' }), [])
  assert.notDeepEqual(withField({ form: 'code' }), [])
  assert.notDeepEqual(withField({ plain: true }), [])
  assert.notDeepEqual(withField({ title: { nodes: [] } }), [])
  assert.notDeepEqual(withField({ title: { screen: 'a' } }), [])
})
