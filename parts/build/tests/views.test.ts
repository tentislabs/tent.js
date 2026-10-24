import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parse } from '../borrowed/vite.ts'
import type { FileReach } from '../read/arrows.ts'
import type { Imported, Known } from '../read/reach.ts'
import { NotPlain, nothingInReach } from '../read/reach.ts'
import { scanOf } from '../read/scan.ts'
import { value } from '../read/value.ts'
import type { ViewsRead } from '../read/views.ts'
import { readViews } from '../read/views.ts'
import { kid, kids, nameOf } from '../tree.ts'

/** What the other files of the project of the cases give a screen file, by the name it imports. */
const others: Record<string, Known> = {
  markPaid: { kind: 'change', definition: 'markPaid' },
  ordersByStatus: { kind: 'query', definition: 'ordersByStatus' },
  getOrder: { kind: 'query', definition: 'getOrder' },
  askAdvice: { kind: 'action', definition: 'askAdvice' },
  helper: { kind: 'agent', definition: 'helper' },
  orderScreen: { kind: 'screen', definition: 'orderScreen' },
  Dialog: { kind: 'component', definition: 'Dialog' },
}

/** A screen file around one screen, whose options are written by the case. */
const fileOf = (options: string): string => `
import { screen, component, read, asset, message, number, round, each, useQuery, Form, Image } from 'tentjs/ui'
import { markPaid, ordersByStatus, getOrder, askAdvice, helper } from '../functions/orders'
import { orderScreen, Dialog } from './other'
import intro from './intro.md'
import { format as far } from 'some-package'

const LABELS = { late: 'Late', open: 'Open' }
const worked = Math.max(1, 2)
function format(n: number) { return String(n) }

export const PriceTag = component('PriceTag', { props: { amount: number() }, view: ({ amount }) => <span>{amount}</span> })

export const shown = screen('shown', { path: '/', access: 'anyone', ${options} })
`

/** What the screen file of a case gives every arrow that is read in it, as the build makes it. */
function reachOf(text: string): FileReach {
  const tree = parse(text, true)
  const seen = scanOf(tree)
  const imports = new Map<string, Imported>()
  for (const one of seen.imports)
    imports.set(
      one.local,
      one.from === 'tentjs/ui'
        ? { ours: one.name }
        : one.from === './intro.md'
          ? { text: 'Welcome.\n', textFile: 'screens/intro.md' }
          : Object.hasOwn(others, one.name)
            ? { app: others[one.name] }
            : { other: one.from },
    )
  const own = new Map<string, Known>()
  for (const one of seen.declared)
    if (one.name !== undefined) own.set(one.exportName, { kind: one.word, definition: one.name })
  const tops = new Map<string, { value?: unknown }>()
  for (const node of kids(tree, 'body')) {
    if (node.type === 'FunctionDeclaration') tops.set(nameOf(kid(node, 'id')) ?? '', {})
    if (node.type !== 'VariableDeclaration') continue
    for (const one of kids(node, 'declarations')) {
      const init = kid(one, 'init')
      try {
        tops.set(nameOf(kid(one, 'id')) ?? '', init ? { value: value(init, nothingInReach()) } : {})
      } catch (failure) {
        if (!(failure instanceof NotPlain)) throw failure
        tops.set(nameOf(kid(one, 'id')) ?? '', {})
      }
    }
  }
  return { imports, own, tops }
}

/** Reads the arrows of the screen of a case. */
function readOf(options: string): ViewsRead {
  const text = fileOf(options)
  const seen = scanOf(parse(text, true))
  const declared = seen.declared.find((one) => one.exportName === 'shown')
  assert.ok(declared, 'the case declares its screen')
  return readViews(declared, reachOf(text), text)
}

const name = (...path: unknown[]) => ({ name: path })

test('[14-7] a `data` that is an arrow is stored as its entries, and the arrows of `title` and of the search-engine fields as one value, by the reader of values', () => {
  const read = readOf(`
    state: {},
    data: ({ params, state }) => ({
      orders: read(ordersByStatus, { status: state.tab, page: 1, search: \`\${state.search}*\`, shown: round(state.shown) }),
      selected: read(getOrder, { id: params.id }, { needed: true }),
      advice: read(askAdvice, {}, { wait: false, refresh: '10 minutes' }),
      working: read(helper.working, { thread: params.id }),
      all: read(getOrder),
    }),
    title: ({ orders }) => message('orders.title', { count: orders.length }),
    seo: { description: ({ selected }) => selected.about ?? LABELS.open, image: () => asset('share.png'), data: ({ selected }) => ({ name: selected.name }), index: false },
    view: () => <main />`)
  assert.equal(read.why, undefined)
  // The file imports the tags `Form` and `Image` and a value word: each is a part of the page code that its views need.
  const needs = ['form', 'image', 'values']
  assert.deepEqual(read.views, {
    needs,
    data: {
      orders: {
        read: 'ordersByStatus',
        input: {
          status: name('state', 'tab'),
          page: 1,
          search: { text: [name('state', 'search'), '*'] },
          shown: { fn: 'round', args: [name('state', 'shown')] },
        },
      },
      selected: { read: 'getOrder', input: { id: name('params', 'id') }, needed: true },
      advice: { read: 'askAdvice', input: {}, wait: false, refresh: '10 minutes' },
      working: { read: 'helper.working', input: { thread: name('params', 'id') } },
      all: { read: 'getOrder' },
    },
    title: { message: 'orders.title', with: { count: name('orders', 'length') } },
    'seo.description': {
      op: '??',
      left: name('selected', 'about'),
      right: {
        read: {
          named: { top: 'LABELS' },
          value: {
            object: [
              ['late', 'Late'],
              ['open', 'Open'],
            ],
          },
        },
        path: ['open'],
      },
    },
    'seo.image': { asset: 'share.png' },
    'seo.data': { object: [['name', name('selected', 'name')]] },
  })
  // A `data` that is a record, and a `title` that is a text, are what their words are handed: nothing is read of them.
  const written = readOf(
    "data: { orders: read(ordersByStatus, { status: 'open' }) }, title: 'Orders', view: () => <main />",
  )
  assert.deepEqual(written.views, { needs })
})

test('[14-7] one call inside a `data`, a `title` or a search-engine field makes it code, and `why` names the call, its option and its line', () => {
  const code = (option: string, written: string, thing: RegExp) => {
    const [first, field] = option.split('.')
    const read = readOf(
      `${field ? `${first}: { ${field}: ${written} }` : `${option}: ${written}`}, view: () => <main />`,
    )
    assert.equal(read.why?.option, option, written)
    assert.match(read.why?.thing ?? '', thing, written)
    return read
  }
  code('title', '({ orders }) => format(orders.length)', /^a call of `format`, a function of the file's own$/)
  code('title', '({ orders }) => far(orders.length)', /^a call of `far`, which is imported from 'some-package'/)
  code('title', '({ orders }) => orders.map((o) => o.name).join()', /^a call of what a read or a call gave: a method/)
  code('title', '() => useQuery(ordersByStatus)', /^a call of `useQuery`$/)
  code(
    'title',
    '() => markPaid({ order: 1 })',
    /^a call of `markPaid`: a screen calls through `read`, `useCall` or a `Form`$/,
  )
  code('title', '() => orderScreen', /^a use of the screen `orderScreen` that a screen's arrow does not hold$/)
  code(
    'title',
    '() => worked',
    /^a read of the top-level `const` `worked`, whose value is no plain value written in place$/,
  )
  code('title', '() => window.name', /^a read of `window`, a name that the arrow does not hold$/)
  code('title', '() => <b>Orders</b>', /^a form that a body does not hold \(JSXElement\)$/)
  code('title', '(handed) => handed.orders', /^the arrow of `title` that takes what it is handed as one name$/)
  code('title', '({ orders }) => { return orders.length }', /^a statement, in the arrow of `title`$/)
  code('seo.image', '({ o }) => far(o)', /^a call of `far`/)
  // A word whose value is drawn, or that the page code leaves to backend code, is no word of a screen.
  code('title', '() => each([1], async (n) => n)', /^an arrow that is `async`$/)
  const data = code(
    'data',
    '({ state }) => ({ orders: read(ordersByStatus, { status: format(state.tab) }) })',
    /^a call of `format`/,
  )
  assert.deepEqual(data.views, { needs: ['form', 'image', 'values'] })
  for (const [written, thing] of [
    ['({ state }) => ({ orders: ordersByStatus })', /^an entry of `data` that is no `read\(\.\.\.\)`$/],
    ['({ state }) => ({ orders: read(state.what) })', /^a `read` of what is no definition that the file names$/],
    [
      '({ state }) => ({ orders: read(getOrder, state.input) })',
      /^an input of `read` that is no record written in place$/,
    ],
    [
      '({ state }) => ({ orders: read(getOrder, {}, { needed: state.strict }) })',
      /^`needed` of a `read` that is no value written in place$/,
    ],
    ['({ state }) => { return {} }', /^a statement, in a `data`$/],
    ['(handed) => ({})', /^a `data` that takes what it is handed as one name$/],
  ] as const)
    code('data', written, thing)
  // The line is that of the thing, counted in the file.
  const read = code('title', '({ orders }) =>\n  format(orders.length)', /^a call of `format`/)
  const line =
    fileOf('')
      .split('\n')
      .findIndex((one) => one.includes("screen('shown'")) + 1
  assert.equal(read.why?.line, line + 1)
})

test('[14-7] a view is code, of which the build tells the components it sees it draw and the parts of the page code its file needs', () => {
  assert.deepEqual(
    readOf(
      'view: () => <main><PriceTag amount={1} /><Dialog /><Form call={markPaid}><input name="note" /></Form></main>',
    ).views,
    {
      uses: ['Dialog', 'PriceTag'],
      needs: ['form', 'image', 'values'],
    },
  )
})
