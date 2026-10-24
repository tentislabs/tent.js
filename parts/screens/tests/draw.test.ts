import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { boolean, choice, project } from '../../core/index.ts'
import { describe } from '../../core/internal.ts'
import type { Answered } from '../draw.ts'
import { draw, findPageCode } from '../draw.ts'
import type { Drawable } from '../borrowed/react.ts'
import { createElement as h, useState } from '../borrowed/react.ts'
import { read, screen } from '../index.ts'
import { livingPage } from '../page/alive.ts'
import { asked } from '../page/data.ts'
import * as server from '../page/server.ts'
import { names } from '../page/server.ts'
import { valueOf } from '../page/valueOf.ts'
import { described, drawingOf, drawn, getOrder, openOrders, pageOf, reader, recordOf, rows } from './drawn.ts'

/** What a view of the tests is handed. */
type Handed = Record<string, unknown>

/** The rows of a list that a view was handed, each a record. */
const listOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map((one) => Object(one)) : []

/** A screen of the tests, at its own name, open to anyone, with the options that the case states. */
const shown = (name: string, options: object = {}): object =>
  screen(name, { path: `/${name}`, access: 'anyone', view: () => null, ...options })

/** The view of a screen as the module of its file gives it to a draw, by its name. */
const views = (name: string, view: (handed: Handed) => Drawable): Record<string, object> => ({
  [name]: { name, kind: 'screen', view },
})

/** A list of orders, drawn in plain elements. */
const list = ({ orders }: Handed): Drawable =>
  h(
    'div',
    null,
    h('h1', null, 'Open orders'),
    ...listOf(orders).map((o) => h('span', { key: String(o.id) }, String(o.name))),
  )

/** The screen of the tests, loaded after the page code was told the folder it lies in. */
async function codeScreen(): Promise<{ definition: object; record: object }> {
  const folder = join(import.meta.dirname, 'views')
  findPageCode(folder)
  const module = await import(pathToFileURL(join(folder, 'orders.tsx')).href)
  return { definition: module.codeScreen, record: module.default }
}

test('[31-2] draw with a test read and no engine draws a screen: its query is asked once, and its answer is in the answers and in the page', async () => {
  const description = described([
    openOrders,
    shown('ordersScreen', { title: 'Orders', data: { orders: read(openOrders, { limit: 2 }) } }),
  ])
  const made = await drawn(description, 'ordersScreen', { views: views('ordersScreen', list) })
  assert.deepEqual(made.asked, [{ what: 'openOrders', input: { limit: 2 }, o: { entry: 'orders' } }])
  assert.deepEqual(made.answers, [{ what: 'openOrders', input: { limit: 2 }, entry: 'orders', value: rows }])
  assert.equal(made.later, false)
  assert.deepEqual(made.pictures, [])
  assert.equal(drawingOf(made.html), '<div><h1>Open orders</h1><span>Ann</span><span>Bo</span></div>')
  // The page record of the document holds the answer, so that the page comes alive with no second asking.
  const page = recordOf(made.html)
  assert.deepEqual(page.answers, made.answers)
  assert.deepEqual({ ...page, answers: [] }, pageOf('ordersScreen'))
  // The whole document: the head names every file that the page loads, and the title is that of the screen.
  const html = made.html ?? ''
  assert.ok(html.startsWith('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'))
  assert.ok(
    html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Orders</title>\n'),
  )
  assert.ok(html.includes('<link rel="stylesheet" href="/_t/b/browser/styles.css">\n'))
  assert.ok(html.includes('<link rel="modulepreload" href="/_t/b/browser/screens.ordersScreen.js">\n'))
  assert.ok(html.endsWith('</script>\n</body>\n</html>\n'))
})

test('[31-2] draw draws a screen whose view uses useQuery, after findPageCode was called for its folder: the query is asked once', async () => {
  const { definition, record } = await codeScreen()
  const description = described([openOrders, definition])
  const made = await drawn(description, 'codeScreen', {
    views: { codeScreen: record },
    page: { params: { id: '42' }, user: { id: 'u1', roles: [] } },
  })
  // The asking of a `useQuery` of the screen's own view names no entry and no component.
  assert.deepEqual(made.asked, [{ what: 'openOrders', input: { limit: 2 }, o: {} }])
  assert.deepEqual(made.answers, [{ what: 'openOrders', input: { limit: 2 }, value: rows }])
  assert.equal(drawingOf(made.html), '<div><h1>42<!-- --> for <!-- -->u1</h1><span>Ann</span><span>Bo</span></div>')
  assert.deepEqual(recordOf(made.html).answers, made.answers)
  // A title that is code is worked out by the module of the screen.
  assert.ok(made.html?.includes('<title>Orders of 42</title>'))
  // The view and the page code hold one React, and the six names of the page code are what a module is answered.
  assert.deepEqual(Object.keys(names).sort(), [
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-dev-runtime',
    'react/jsx-runtime',
    'tentjs/ui',
  ])
  assert.equal(Reflect.get(names.react, 'useState'), useState)
  // The server file gives the things that an engine and the build take of it: in development, also what tells the
  // tags that drew a view that failed.
  assert.deepEqual(Object.keys(server).sort(), ['draw', 'findPageCode', 'names', 'ownersOf'])
  assert.equal(server.draw, draw)
  assert.equal(server.findPageCode, findPageCode)
  assert.equal(Reflect.get(names['tentjs/ui'], 'screen'), screen)
})

test('[31-3] a heavy query in a useQuery: the first pass answers later, and the page that is drawn with its answer holds its rows', async () => {
  const { definition, record } = await codeScreen()
  const description = described([openOrders, definition])
  const views = { codeScreen: record }
  // What cannot answer at once is answered `later` and started, and the draw says so.
  const first = await drawn(description, 'codeScreen', {
    views,
    page: { params: { id: '42' } },
    answers: { openOrders: (told: object) => ({ ...told, later: true }) },
  })
  assert.equal(first.later, true)
  assert.deepEqual(first.answers, [{ what: 'openOrders', input: { limit: 2 }, later: true }])
  assert.ok(drawingOf(first.html).includes('Still asked'))
  // The engine waits for the answer and draws again with it in the page: nothing is asked a second time.
  const answered = [{ what: 'openOrders', input: { limit: 2 }, value: rows, mark: '0123456789abcdef' }]
  const second = await drawn(description, 'codeScreen', { views, page: { params: { id: '42' }, answers: answered } })
  assert.deepEqual(second.asked, [])
  assert.equal(second.later, false)
  assert.deepEqual(second.answers, answered)
  assert.ok(drawingOf(second.html).includes('<span>Ann</span><span>Bo</span>'))
  assert.deepEqual(recordOf(second.html).answers, answered)
})

test('[31-2] an entry is asked with its input worked out, is not asked while a value it needs is missing, and one that fails or is needed and answers nothing draws no view', async () => {
  const view = ({ selected, orders }: Handed): Drawable =>
    h('span', null, `${String(Object(selected ?? {}).name ?? '')}/${listOf(orders).length}`)
  const options = {
    state: { tab: { type: choice(['open', 'paid'], { default: 'open' }), in: 'address' as const }, wide: boolean() },
    data: () => ({}),
  }
  const data = {
    orders: {
      read: 'openOrders',
      input: { status: { name: ['state', 'tab'] }, limit: { op: '+', left: 1, right: 2 } },
    },
    selected: { read: 'getOrder', input: { id: { name: ['params', 'id'] } }, needed: true },
  }
  const description = described([
    openOrders,
    getOrder,
    {
      value: screen('s', { path: '/s/:id', access: 'anyone', view: () => null, ...options }),
      views: { data },
    },
  ])
  const drawnOf = (more: Parameters<typeof drawn>[2] = {}) =>
    drawn(description, 's', { ...more, views: views('s', view) })
  const one = { id: 'a', name: 'Ann' }
  // The input reads the address and the state: the state starts as its default, and the address holds over it.
  const made = await drawnOf({ page: { params: { id: 'a' } }, answers: { getOrder: one } })
  assert.deepEqual(made.asked, [
    { what: 'openOrders', input: { status: 'open', limit: 3 }, o: { entry: 'orders' } },
    { what: 'getOrder', input: { id: 'a' }, o: { entry: 'selected', needed: true } },
  ])
  assert.equal(drawingOf(made.html), '<span>Ann/2</span>')
  // The page record holds the state that is kept in the address, and none that lives in the page.
  assert.deepEqual(recordOf(made.html).state, { tab: 'open' })
  const paid = await drawnOf({
    page: { params: { id: 'a' }, state: { tab: 'paid' } },
    answers: { getOrder: one },
  })
  assert.deepEqual(paid.asked[0].input, { status: 'paid', limit: 3 })
  // An entry whose input lacks a value that its function requires is not asked, and its name is nothing.
  const missing = await drawnOf({ answers: { getOrder: one } })
  assert.deepEqual(
    missing.asked.map((asked) => asked.what),
    ['openOrders'],
  )
  assert.equal(drawingOf(missing.html), '<span>/2</span>')
  // A `needed` entry that answers nothing, and an entry that fails, run no view: the engine picks the outcome.
  const gone = await drawnOf({ page: { params: { id: 'x' } }, answers: { getOrder: null } })
  assert.equal(gone.html, undefined)
  assert.deepEqual(gone.answers[1], {
    what: 'getOrder',
    input: { id: 'x' },
    entry: 'selected',
    needed: true,
    value: null,
  })
  const error = { code: 'T3101', name: 'not-allowed', message: 'You may not do this.' }
  const failed = await drawnOf({
    page: { params: { id: 'a' } },
    answers: { openOrders: (told: object) => ({ ...told, error }), getOrder: one },
  })
  assert.equal(failed.html, undefined)
  assert.deepEqual(failed.answers[0].error, error)
  // An entry that the page does not wait for stops nothing: its name is nothing, and `calls` says that it is asked.
  const waiting = described([openOrders, shown('w', { data: { orders: read(openOrders, {}, { wait: false }) } })])
  const left = await drawn(waiting, 'w', {
    answers: { openOrders: (told: object) => ({ ...told, left: 'wait' }) },
    views: views('w', ({ calls }) => h('span', null, Object(Object(calls).orders).busy ? 'Asking' : 'Done')),
  })
  assert.deepEqual(left.asked[0].o, { entry: 'orders', wait: false })
  assert.equal(drawingOf(left.html), '<span>Asking</span>')
})

test('[31-2] an entry whose input changed keeps its old answer until the new one arrives, and tells how often an action is asked again', async () => {
  const record = {
    name: 's',
    kind: 'screen' as const,
    data: {
      orders: { query: 'openOrders', input: { status: { name: ['state', 'tab'] } } },
      rates: { action: 'rates', input: {}, refresh: 600000 },
      written: { read: 'rates', input: { base: 'EUR' }, refresh: '10 minutes' },
    },
  }
  const asks: { what: string; input: unknown; how: object }[] = []
  const held = new Map<string, Answered>()
  const store = {
    ...livingPage(pageOf('s'), [record], { post: async () => ({ ok: true }), go: () => {}, every: () => () => {} }),
    ask: (what: string, input: unknown, how: object) => {
      asks.push({ what, input, how })
      return held.get(JSON.stringify([what, input]))
    },
  }
  const open = { what: 'openOrders', input: { status: 'open' }, value: ['an open one'] }
  held.set(JSON.stringify(['openOrders', { status: 'open' }]), open)
  const first = asked(record, { state: { tab: 'open' } }, store)
  assert.deepEqual(first.values.orders, ['an open one'])
  assert.deepEqual(first.calls.orders, { busy: false })
  // The state changed: the entry is asked with the new input, is busy, and still shows what it showed.
  const second = asked(record, { state: { tab: 'paid' } }, store)
  assert.deepEqual(asks.at(-3), {
    what: 'openOrders',
    input: { status: 'paid' },
    how: { entry: 'orders', kind: 'query' },
  })
  assert.deepEqual(second.values.orders, ['an open one'])
  assert.deepEqual(second.calls.orders, { busy: true })
  held.set(JSON.stringify(['openOrders', { status: 'paid' }]), {
    what: 'openOrders',
    input: { status: 'paid' },
    value: [],
  })
  assert.deepEqual(asked(record, { state: { tab: 'paid' } }, store).values.orders, [])
  // A length of time is told in milliseconds, as the description stores it and as `read` was handed it. An entry
  // tells what kind it reads where its record says so: one that only names what it reads tells none.
  assert.deepEqual(asks.at(-2)?.how, { entry: 'rates', every: 600000, kind: 'action' })
  assert.deepEqual(asks.at(-1), { what: 'rates', input: { base: 'EUR' }, how: { entry: 'written', every: 600000 } })
})

test('[31-5] a row whose text holds the end of a script and a line separator is in the page record and in a title, and is read back and shown as written', async () => {
  const hard = `</script><script>alert(1)</script> & "quoted" <b>bold</b>${String.fromCharCode(0x2028)}next${String.fromCharCode(0x2029)}`
  const description = described([
    openOrders,
    {
      value: screen('hard', {
        path: '/hard',
        access: 'anyone',
        data: { orders: read(openOrders) },
        title: () => '',
        view: () => null,
      }),
      views: { title: { name: ['orders', 0, 'name'] } },
    },
  ])
  const made = await drawn(description, 'hard', {
    answers: { openOrders: [{ id: 'a', name: hard }] },
    views: views('hard', ({ orders }) => h('span', null, String(listOf(orders)[0]?.name))),
  })
  const html = made.html ?? ''
  // No text of a row ends the block or starts a tag: the block holds no `<`, no `>`, no `&` and no line separator.
  const block = /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
  const separators = String.fromCharCode(0x2028, 0x2029)
  assert.ok(
    block.length > 0 && ![...`<>&${separators}`].some((sign) => block.includes(sign)),
    'the block holds none of the five characters',
  )
  assert.equal(html.split('<script').length, 2, 'the document holds its one block and no other script')
  assert.ok(!html.includes('<b>bold</b>'))
  // The page reads the record back as it was written.
  assert.equal(Object(Object(recordOf(html).answers[0].value)[0]).name, hard)
  // The title and the drawing hold the text as text, with the characters that mean something written as names.
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? ''
  const words = /<span>([\s\S]*?)<\/span>/.exec(html)?.[1] ?? ''
  const back = (text: string) =>
    text.replace(
      /&(amp|lt|gt|quot|#39|#x27);/g,
      (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[name] ?? "'",
    )
  assert.ok(!/[<>]/.test(title) && !/[<>]/.test(words))
  assert.equal(back(title), hard)
  assert.equal(back(words), hard)
})

test('[31-2] the document carries no style of the engine, and a screen that is not drawn on the server is sent with its answers and no drawing', async () => {
  const shop = (state: object = {}) =>
    describe({
      definitions: [
        { value: project('shop', Object({ state })) },
        { value: openOrders },
        { value: shown('s', { data: { orders: read(openOrders) }, server: false }) },
        { value: shown('t') },
      ],
    }).description
  const { read: asks } = reader()
  const html = async (description: ReturnType<typeof shop>, name: string, state: Record<string, unknown> = {}) =>
    (
      await draw({
        description,
        page: pageOf(name, { state }),
        read: asks,
        views: {
          ...views('s', () => h('span', null, 'Words')),
          ...views('t', ({ state }) => h('span', null, String(Object(state).mode))),
        },
        picture: () => undefined,
      })
    ).html ?? ''
  // A state of the device that the project names is the app's own: the first HTML is already in what the device
  // holds for it, and the document is the plain one.
  const picked = shop({ mode: { type: choice(['auto', 'light', 'dark'], { default: 'auto' }), in: 'device' } })
  const dark = await html(picked, 't', { mode: 'dark' })
  assert.ok(dark.includes('<html lang="en">'))
  assert.equal(drawingOf(dark), '<span>dark</span>')
  const sent = await html(shop(), 's')
  assert.equal(drawingOf(sent), '')
  assert.deepEqual(recordOf(sent).answers, [{ what: 'openOrders', input: {}, entry: 'orders', value: rows }])
  // A screen that the description does not hold is an error of whoever asked for it.
  await assert.rejects(html(shop(), 'none'), /holds no screen `none`/)
})

test('[31-2] the page code works a stored value out in the names it is handed', async () => {
  assert.equal(valueOf({ text: ['Order ', { name: ['order', 'id'] }] }, { names: { order: { id: 7 } } }), 'Order 7')
  assert.deepEqual(valueOf({ object: [['id', { name: ['order', 'id'] }]] }, { names: { order: { id: 7 } } }), {
    id: 7,
  })
})

test('[31-2] the page record holds the state that is kept in the address and in the device, and no other: a state that lives in the page starts in the browser as its screen and its project declare it', async () => {
  const state = {
    mode: { type: choice(['auto', 'dark'], { default: 'auto' }), in: 'device' as const },
    banner: boolean(),
  }
  const options = {
    state: { tab: { type: choice(['open', 'paid'], { default: 'open' }), in: 'address' as const }, wide: boolean() },
  }
  const view = ({ state: now }: Handed): Drawable => {
    const held = Object(now)
    return h('span', null, `${String(held.tab)} ${String(held.mode)} ${held.wide ? 'wide' : 'narrow'}`)
  }
  const made = describe({
    definitions: [{ value: project('shop', Object({ state })) }, { value: shown('kept', options) }],
  })
  assert.deepEqual(made.findings, [])
  const html = (
    await draw({
      description: made.description,
      page: pageOf('kept', { state: { tab: 'paid' } }),
      read: reader().read,
      views: views('kept', view),
      picture: () => undefined,
    })
  ).html
  // The view on the server is handed every state, each as it starts, with the address over it.
  assert.equal(drawingOf(html), '<span>paid auto narrow</span>')
  const record = recordOf(html)
  assert.deepEqual(record.state, { tab: 'paid', mode: 'auto' })
  // In the browser the page starts with what the record holds, over what the module of the screen declares: its
  // own state, and the state of the project, which the build writes into the module.
  const stored = made.description.screens.kept
  const page = livingPage(
    record,
    [
      {
        name: 'kept',
        kind: 'screen',
        view,
        state: Object(stored.state),
        shared: Object(made.description.project.state),
      },
    ],
    { post: async () => ({ ok: true }), go: () => {} },
  )
  assert.deepEqual(page.state, { tab: 'paid', mode: 'auto', wide: false, banner: false })
})
