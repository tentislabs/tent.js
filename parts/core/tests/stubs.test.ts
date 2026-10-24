import assert from 'node:assert/strict'
import { test } from 'node:test'
import { action, change, flow, input, number, project, query, table, text } from '../index.ts'
import { describe, isPath, isStored, stubOf } from '../internal.ts'

test('[31-1a] what a screen holds of a definition is one record for the build and for the draw: the name, the kind, the input of what a screen may call, and nothing of a rule, of code or of an output', () => {
  const orders = table('orders', { columns: { name: text(), total: number() }, access: { read: 'anyone' } })
  const made = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: orders },
      {
        value: query('openOrders', {
          access: 'signedIn',
          input: { limit: number({ default: 5 }) },
          rows: orders.limit(input('limit')),
        }),
      },
      { value: query('stillOrders', { access: 'anyone', live: false, rows: orders.limit(1) }) },
      {
        value: change('addOrder', {
          access: 'anyone',
          input: { name: text() },
          set: orders.add({ name: input('name'), total: 1 }),
        }),
      },
      { value: action('ask', { access: 'anyone', input: { words: text() }, run: async () => 'answered' }) },
      { value: action('askLong', { access: 'anyone', follow: 'signedIn', run: async () => 'answered' }) },
      // A flow that is offered states `access`, and a screen starts it with its input. One that is not holds none.
      { value: flow('offered', { access: 'signedIn', input: { order: text() }, run: async () => undefined }) },
      { value: flow('inner', { input: { order: text() }, run: async () => undefined }) },
      { value: flow('watched', { access: 'signedIn', follow: 'signedIn', run: async () => undefined }) },
    ],
  })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  // A screen, as the description stores one: its address, and its state, of which one is kept in the address.
  const description = {
    ...made.description,
    screens: {
      orderScreen: {
        path: '/orders/:id',
        state: { tab: { type: { kind: 'text', default: 'all' }, in: 'address' }, open: { kind: 'text', default: '' } },
      },
    },
  }
  // Each stub that holds an input holds the checks a form makes of it, made of the same types.
  const working = (name: string) => ({
    definition: `${name}.working`,
    kind: 'query',
    input: {},
    checks: {},
    live: true,
  })
  const wanted: Record<string, unknown> = {
    openOrders: {
      definition: 'openOrders',
      kind: 'query',
      input: { limit: { kind: 'number', default: 5 } },
      checks: { limit: { required: false, type: { kind: 'number', default: 5 } } },
      live: true,
    },
    stillOrders: { definition: 'stillOrders', kind: 'query', input: {}, checks: {}, live: false },
    addOrder: {
      definition: 'addOrder',
      kind: 'change',
      input: { name: { kind: 'text' } },
      checks: { name: { required: true, type: { kind: 'text' } } },
    },
    ask: {
      definition: 'ask',
      kind: 'action',
      input: { words: { kind: 'text' } },
      checks: { words: { required: true, type: { kind: 'text' } } },
    },
    askLong: { definition: 'askLong', kind: 'action', input: {}, checks: {}, working: working('askLong') },
    offered: {
      definition: 'offered',
      kind: 'flow',
      input: { order: { kind: 'text' } },
      checks: { order: { required: true, type: { kind: 'text' } } },
    },
    inner: { definition: 'inner', kind: 'flow' },
    watched: { definition: 'watched', kind: 'flow', input: {}, checks: {}, working: working('watched') },
    orderScreen: { definition: 'orderScreen', kind: 'screen', path: '/orders/:id', state: ['tab'] },
    orders: { definition: 'orders', kind: 'table' },
    // A query that the engine gives beside a definition, and a name that is none.
    'watched.working': working('watched'),
    nothing: undefined,
  }
  for (const [name, stub] of Object.entries(wanted)) assert.deepEqual(stubOf(description, name), stub, name)
  // No stub holds a rule, code or an output.
  const all = JSON.stringify(Object.keys(wanted).map((name) => stubOf(description, name)))
  for (const word of ['access', 'signedIn', 'rows', 'run', 'set', 'output']) assert.ok(!all.includes(`"${word}"`), word)
})

test('[31-1a] a name with a dot has a stub only where the engine gives that member: `working` of a flow and of an action that states `follow`', () => {
  const { description } = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: action('askLong', { access: 'anyone', follow: 'signedIn', run: async () => 'answered' }) },
      { value: action('ask', { access: 'anyone', run: async () => 'answered' }) },
      { value: flow('watched', { access: 'signedIn', follow: 'signedIn', run: async () => undefined }) },
      { value: flow('inner', { run: async () => undefined }) },
    ],
  })
  for (const name of ['askLong.working', 'watched.working']) assert.equal(stubOf(description, name)?.live, true, name)
  for (const name of ['ask.working', 'inner.working', 'watched.other', 'nothing.working'])
    assert.equal(stubOf(description, name), undefined, name)
})

test('[30-3] the rule of a path has one home: a path starts with one slash and holds no two slashes, no backslash and no control character, as it is written and with its percent signs read', () => {
  for (const path of ['/', '/orders', '/orders/42', '/orders?tab=open&tab=new', '/a%20b', '/docs/a/b/c', '/orders#top'])
    assert.equal(isPath(path), true, path)
  for (const path of [
    '',
    'orders',
    '//evil.example',
    '/a//b',
    '/\\evil.example',
    '/a\\b',
    'https://evil.example',
    'javascript:alert(1)',
    '/a\tb',
    '/a\nb',
    '/a\u007fb',
    // With its percent signs read, each of these is one of the above.
    '/%2F%2Fevil.example',
    '/%5Cevil.example',
    '/a%09b',
    '/a%0Ab',
    // Percent signs that stand for nothing are no path.
    '/a%zz',
    '/%E0%A4%A',
  ])
    assert.equal(isPath(path), false, JSON.stringify(path))
})

test('[13-1@5] isStored says whether a value is a record that is no list', () => {
  for (const value of [{}, { a: 1 }, Object.create(null)]) assert.equal(isStored(value), true)
  for (const value of [null, undefined, [], [1], 'text', 5, true, () => 1]) assert.equal(isStored(value), false)
})
