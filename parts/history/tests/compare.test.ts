import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { action, flow, link, number, project, query, table, text } from '../../core/index.ts'
import type { Description, Loaded } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import type { Change, Point } from '../index.ts'
import { lineOf } from '../index.ts'
import { ada, codeOf, day, fingerprintOf, openedIn, pointOf, put, started, workFolder } from './work.ts'
import { held } from '../../../rig/budgets.ts'

/** The stored call of one step that tells somebody some words. */
const step = (name: string, words: string): object => ({
  do: { await: { fn: 'step', args: [name, { arrow: [], do: [{ return: words }] }] } },
})

/** The text of the file of a code action, with the place of its definition. */
function refundFile(lines: string[]): { text: string; from: number; to: number } {
  const definition = `export const refund = action('refund', {\n  access: 'signedIn',\n  run: async () => {\n${lines.map((line) => `    ${line}\n`).join('')}  },\n})`
  const text = `import { action } from 'tentjs'\n\n${definition}\n`
  return { text, from: text.indexOf('export'), to: text.indexOf('export') + definition.length - 1 }
}

const before = refundFile(Array.from({ length: 12 }, (_, n) => `await first(${n})`))
const after = refundFile(Array.from({ length: 12 }, (_, n) => `await second(${n})`))

/** A description of the definitions that are handed, which must describe with no error. */
function described(definitions: Loaded[]): Description {
  const made = describe({ definitions })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => one.message),
    [],
  )
  return made.description
}

const run = async (): Promise<void> => undefined

/** The older description: the app before the changes. */
function older(): Description {
  const customers = table('customers', { columns: { name: text() }, access: { read: 'signedIn' } })
  const orders = table('orders', {
    columns: { total: number({ max: 100 }), buyer: link('customers'), legacy: text({ optional: true }) },
    access: { read: 'signedIn' },
  })
  return described([
    { value: project('shop', {}) },
    { value: customers },
    { value: orders },
    { value: query('openOrders', { access: 'signedIn', rows: orders.limit(50) }) },
    { value: query('oldOrders', { access: 'signedIn', rows: orders.limit(5) }) },
    {
      value: action('refund', { access: 'signedIn', run }),
      file: 'functions/refund.ts',
      from: before.from,
      to: before.to,
    },
    {
      value: flow('bigOrder', { run }),
      bodies: { run: [step('find customer', 'find'), step('tell sales', 'A big order'), step('old step', 'old')] },
    },
    { value: flow('nightly', { run }), bodies: { run: [{ return: 1 }] } },
  ])
}

/** The newer description: the same app after one change of each kind. */
function newer(): Description {
  const clients = table('clients', { columns: { name: text() }, access: { read: 'signedIn' }, was: 'customers' })
  const orders = table('orders', {
    columns: {
      total: number({ max: 500 }),
      customer: link('clients', { was: 'buyer' }),
      note: text({ optional: true }),
    },
    access: { read: 'signedIn' },
    removed: ['legacy'],
  })
  return described([
    { value: project('shop', {}) },
    { value: clients },
    { value: orders },
    { value: query('openOrders', { access: 'signedIn', rows: orders.limit(100) }) },
    { value: query('closedOrders', { access: 'signedIn', rows: orders.limit(5) }) },
    {
      value: action('refund', { access: 'signedIn', run }),
      file: 'functions/refund.ts',
      from: after.from,
      to: after.to,
    },
    {
      value: flow('bigOrder', { run }),
      bodies: {
        run: [step('find customer', 'find'), step('tell sales', 'A very big order'), step('follow up', 'new')],
      },
    },
    { value: flow('nightly', { run }), bodies: { run: [{ return: 2 }] } },
  ])
}

// The stored records of the changes from the older point to the newer one, each with the line that is printed for it.
const stored: [Change, string][] = [
  [{ change: 'renamed', what: 'table', name: 'clients', was: 'customers' }, 'table clients: renamed from customers'],
  [
    { change: 'removed', what: 'column', name: 'orders.legacy', from: { kind: 'text', optional: true } },
    'table orders: column "legacy" removed',
  ],
  [
    { change: 'added', what: 'column', name: 'orders.note', to: { kind: 'text', optional: true } },
    'table orders: column "note" added (text, optional)',
  ],
  [
    { change: 'renamed', what: 'column', name: 'orders.customer', was: 'orders.buyer' },
    'table orders: column "buyer" renamed to "customer"',
  ],
  [
    { change: 'changed', what: 'column', name: 'orders.customer', path: ['table'], from: 'customers', to: 'clients' },
    'table orders: column "customer": table changed "customers" -> "clients"',
  ],
  [
    { change: 'changed', what: 'column', name: 'orders.total', path: ['max'], from: 100, to: 500 },
    'table orders: column "total": max changed 100 -> 500',
  ],
  [
    { change: 'changed', what: 'table', name: 'orders', path: ['removed'], to: ['legacy'] },
    'table orders: removed changed nothing -> ["legacy"]',
  ],
  [{ change: 'removed', what: 'query', name: 'oldOrders' }, 'query oldOrders: removed'],
  [{ change: 'added', what: 'query', name: 'closedOrders' }, 'query closedOrders: added'],
  [
    { change: 'changed', what: 'query', name: 'openOrders', path: ['plan', 'limit'], from: 50, to: 100 },
    'query openOrders: plan.limit changed 50 -> 100',
  ],
  [{ change: 'changed', what: 'action', name: 'refund', lines: 12 }, 'action refund: code changed (12 lines)'],
  [{ change: 'changed', what: 'step', name: 'bigOrder.tell sales' }, 'flow bigOrder: step "tell sales" changed'],
  [{ change: 'removed', what: 'step', name: 'bigOrder.old step' }, 'flow bigOrder: step "old step" removed'],
  [{ change: 'added', what: 'step', name: 'bigOrder.follow up' }, 'flow bigOrder: step "follow up" added'],
  // The body around the steps holds the name of each step in its place: it changed where a step came or went.
  [{ change: 'changed', what: 'flow', name: 'bigOrder', path: ['body'] }, 'flow bigOrder: body changed'],
  [{ change: 'changed', what: 'flow', name: 'nightly', path: ['body'] }, 'flow nightly: body changed'],
  [{ change: 'changed', what: 'file', name: 'assets/logo.png' }, 'file assets/logo.png: changed'],
  [{ change: 'added', what: 'file', name: 'assets/new.png' }, 'file assets/new.png: added'],
  [{ change: 'removed', what: 'file', name: 'assets/old.png' }, 'file assets/old.png: removed'],
  [{ change: 'changed', what: 'file', name: 'notes.txt', lines: 1 }, 'file notes.txt: changed'],
]

test('[40-2] for a pair of points that holds each row of the table of compare, compare answers the stored records, each with its stored line, and a point with no description is compared file by file', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 14) })
  const { project: folder, history } = started(t, {
    'functions/refund.ts': before.text,
    'assets/logo.png': new Uint8Array([137, 80, 78, 71, 0, 1]),
    'assets/old.png': new Uint8Array([0, 1, 2]),
    'notes.txt': 'one line\nsame line\n',
  })
  history.record(folder, { by: ada, kind: 'named', name: 'older', description: older() })
  put(folder, 'functions/refund.ts', after.text)
  put(folder, 'assets/logo.png', new Uint8Array([137, 80, 78, 71, 0, 2]))
  put(folder, 'assets/new.png', new Uint8Array([9, 9]))
  put(folder, 'notes.txt', 'another line\nsame line\n')
  rmSync(join(folder, 'assets/old.png'))
  t.mock.timers.tick(60_000)
  const point = history.record(folder, { by: ada, kind: 'named', name: 'newer', description: newer() })

  const changes = history.compare('older', 'newer')
  assert.deepEqual(
    changes,
    stored.map(([change]) => change),
  )
  assert.deepEqual(
    changes.map(lineOf),
    stored.map(([, line]) => line),
  )
  assert.deepEqual(history.compare('older', point.id.slice(0, 8)), changes, 'a point is named by whatever find takes')
  assert.deepEqual(history.compare('newer', 'now'), [])

  // A point that did not build holds no description: the two are compared file by file, as text.
  t.mock.timers.tick(60_000)
  put(folder, 'notes.txt', 'another line\nsame line\na third line\n')
  history.record(folder, { by: ada, kind: 'command' })
  assert.deepEqual(history.compare('older', 'now'), [
    { change: 'changed', what: 'file', name: 'assets/logo.png' },
    { change: 'added', what: 'file', name: 'assets/new.png' },
    { change: 'removed', what: 'file', name: 'assets/old.png' },
    { change: 'changed', what: 'file', name: 'functions/refund.ts', lines: 12 },
    { change: 'changed', what: 'file', name: 'notes.txt', lines: 2 },
  ])
  assert.deepEqual(history.compare('newer', 'now'), [{ change: 'changed', what: 'file', name: 'notes.txt', lines: 1 }])
})

test('[40-2] a definition that is missing on one side and new on the other is removed and added, and never guessed to be a rename, and a step of onFail carries onFail in its name', (t) => {
  const { project: folder, history } = started(t, { 'tent.ts': 'x' })
  const orders = table('orders', { columns: { total: number() }, access: { read: 'signedIn' } })
  const flowOf = (words: string, around: unknown): Loaded => ({
    value: flow('bigOrder', { run, onFail: run }),
    bodies: { run: [{ return: around }], onFail: [step('tell owner', words), { return: around }] },
  })
  const one = described([
    { value: project('shop', { title: 'Shop' }) },
    { value: orders },
    { value: table('customers', { columns: { name: text() }, access: { read: 'signedIn' } }) },
    flowOf('It failed', 1),
  ])
  const two = described([
    { value: project('shop', { title: 'The shop' }) },
    { value: orders },
    { value: table('clients', { columns: { name: text() }, access: { read: 'signedIn' } }) },
    flowOf('It failed for good', 2),
  ])
  history.record(folder, { by: ada, kind: 'named', name: 'one', description: one })
  history.record(folder, { by: ada, kind: 'named', name: 'two', description: two })
  const changes = history.compare('one', 'two')
  assert.deepEqual(changes, [
    { change: 'removed', what: 'table', name: 'customers' },
    { change: 'added', what: 'table', name: 'clients' },
    { change: 'changed', what: 'flow', name: 'bigOrder', path: ['body'] },
    { change: 'changed', what: 'step', name: 'bigOrder.onFail.tell owner' },
    { change: 'changed', what: 'flow', name: 'bigOrder', path: ['onFail'] },
    { change: 'changed', what: 'project', name: 'shop', path: ['title'], from: 'Shop', to: 'The shop' },
  ])
  assert.deepEqual(changes.map(lineOf).slice(2), [
    'flow bigOrder: body changed',
    'flow bigOrder: step "onFail.tell owner" changed',
    'flow bigOrder: onFail changed',
    'project shop: title changed "Shop" -> "The shop"',
  ])
})

test('[40-2] a step whose name the body writes twice names no step, and is a change of the body around: no step of that name is said to change', (t) => {
  const { project: folder, history } = started(t, { 'tent.ts': 'x' })
  const flowOf = (second: string): Loaded => ({
    value: flow('bigOrder', { run }),
    bodies: { run: [step('notify', 'first'), step('notify', second), step('close', 'done')] },
  })
  history.record(folder, {
    by: ada,
    kind: 'named',
    name: 'one',
    description: described([{ value: project('shop', {}) }, flowOf('second')]),
  })
  history.record(folder, {
    by: ada,
    kind: 'named',
    name: 'two',
    description: described([{ value: project('shop', {}) }, flowOf('another')]),
  })
  assert.deepEqual(history.compare('one', 'two'), [
    { change: 'changed', what: 'flow', name: 'bigOrder', path: ['body'] },
  ])
})

test('[40-2] a was that names a thing which is still there is no rename: the newer thing is added, and the one it names is matched with itself', (t) => {
  const { project: folder, history } = started(t, { 'tent.ts': 'x' })
  const customers = table('customers', { columns: { name: text() }, access: { read: 'signedIn' } })
  const one = described([{ value: project('shop', {}) }, { value: customers }])
  const two = described([
    { value: project('shop', {}) },
    { value: customers },
    { value: table('clients', { columns: { name: text() }, access: { read: 'signedIn' }, was: 'customers' }) },
  ])
  history.record(folder, { by: ada, kind: 'named', name: 'one', description: one })
  history.record(folder, { by: ada, kind: 'named', name: 'two', description: two })
  assert.deepEqual(history.compare('one', 'two'), [{ change: 'added', what: 'table', name: 'clients' }])
})

test('[16-2@7d] [40-2] comparing with a point that is not there, and with one that was dropped, is T9107', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 14) })
  const { project: folder, history } = started(t, { 'tent.ts': '0' })
  const old = history.record(folder, { by: ada, kind: 'save' })
  t.mock.timers.tick(31 * day)
  put(folder, 'tent.ts', '1')
  history.record(folder, { by: ada, kind: 'named', name: 'kept' })
  assert.deepEqual(history.compare(old.id, 'kept'), [{ change: 'changed', what: 'file', name: 'tent.ts', lines: 1 }])
  history.tidy(Date.now(), { kept: 30 * day })
  assert.equal(
    codeOf(() => history.compare(old.id, 'kept')),
    'T9107',
  )
  assert.equal(
    codeOf(() => history.compare('kept', 'no such point')),
    'T9107',
  )
})

test('[40-3b] a history of 10,000 points compares two of its points within a second', (t) => {
  const folder = workFolder(t)
  const history = openedIn(folder)
  const blobs: Record<string, Uint8Array> = {}
  const files: Record<string, string> = {}
  for (let n = 0; n < 40; n++) {
    const bytes = new TextEncoder().encode(`export const t${n} = 1\n`.repeat(40))
    files[`tables/t${n}.ts`] = fingerprintOf(bytes)
    blobs[fingerprintOf(bytes)] = bytes
  }
  const points: Point[] = []
  for (let n = 0; n < 10_000; n++) {
    const bytes = new TextEncoder().encode(`line\n`.repeat(n % 50) + `project ${n}\n`)
    blobs[fingerprintOf(bytes)] = bytes
    points.push(
      pointOf({
        parents: n ? [points[n - 1].id] : [],
        at: 1_790_000_000_000 + n * 60_000,
        by: ada,
        kind: 'command',
        files: { ...files, 'tent.ts': fingerprintOf(bytes) },
      }),
    )
  }
  history.take({ blobs, points })
  history.move('now', points[9_999].id)
  const began = performance.now()
  const changes = history.compare(points[17].id, 'now')
  const took = performance.now() - began
  assert.deepEqual(changes, [{ change: 'changed', what: 'file', name: 'tent.ts', lines: 33 }])
  held('history.compare', took, 'ms')
})
