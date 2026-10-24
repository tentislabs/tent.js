import type { Case } from './bodies-world.ts'

// What each of the twenty bodies is run with: one or more cases, each with what its run is handed. A case that is
// built to fail says so.

const lines = [
  { qty: 2, price: 10 },
  { qty: 0, price: 5 },
  { qty: 1, price: 99.5, note: 'free' },
]

export const cases: Record<string, Case[]> = {
  orderById: [
    { name: 'an order that is there', input: { order: 'o2' } },
    { name: 'an order that is not there', input: { order: 'o404' } },
  ],
  orderList: [
    { name: 'the open orders', input: { status: 'open' } },
    { name: 'no status asked for', input: {} },
    { name: 'a second page', input: { least: 100, limit: 1, skip: 1 } },
  ],
  placeByText: [
    { name: 'a tab that is there', input: { tab: 'open', at: 0, counts: { 'first order': 4, late: 2 }, key: 'late' } },
    {
      name: 'a tab by a name that every record has',
      input: { tab: 'toString', at: 1, counts: { 'first order': 1 }, key: 'constructor' },
    },
    { name: 'a tab that is not there', input: { tab: 'closed', at: -1, counts: {}, key: 'none' } },
  ],
  nameNotHeld: [
    {
      name: 'names that the kind of a value holds',
      input: { order: 'o1', note: '  late again ', tags: ['a', 'b'], extra: {}, count: 3 },
    },
    {
      name: 'built to fail: a read into an order that is not there',
      fails: true,
      input: { order: 'o404', note: '', tags: [], extra: {}, count: 0 },
    },
  ],
  twoMoments: [
    { name: 'an old order', input: { order: 'o1', text: '2026-09-01T10:00:00.000Z' } },
    { name: 'a new order', input: { order: 'o4', text: 'Mon Sep 28 2026' } },
  ],
  searchPage: [
    {
      name: 'rows and marks that are there',
      input: {
        text: 'maya',
        cursor: 'o2',
        like: [0.1, 0.9],
        rows: [{ id: 'r1' }, { id: 'r2' }],
        at: 1,
        marks: { '?late': 3, late: 9 },
      },
    },
    { name: 'rows that are not there', input: { text: '', like: [], at: 0, marks: { late: 1 } } },
    { name: 'built to fail: no marks', fails: true, input: { text: '', like: [], at: 0 } },
  ],
  valueWords: [
    { name: 'every word', input: { above: 500, name: 'maya DEMIR', note: '  Late again ' } },
    { name: 'built to fail: a word is handed nothing', fails: true, input: { above: 500, name: 'ali kaya' } },
  ],
  signsAndMarks: [
    { name: 'three lines', input: { month: '2026-10', code: 'a\u{1F600}b', lines } },
    {
      name: 'a dash in the code',
      input: { month: '2026-11', code: 'ab-c', lines: [{ qty: 1, price: 2000, note: 'rush' }] },
    },
    {
      name: 'a line too large',
      input: {
        month: '2026-12',
        code: '',
        lines: [
          { qty: 1, price: 3 },
          { qty: 100, price: 1 },
        ],
      },
    },
  ],
  addOrder: [
    { name: 'paid at once', input: { customer: 'c1', total: 50, paid: true } },
    { name: 'not paid', input: { customer: 'c2', total: 75, paid: false, oldPayment: 'p1' } },
    { name: 'built to fail: no such customer', fails: true, input: { customer: 'c404', total: 1 } },
  ],
  orderPage: [
    { name: 'any order', input: { order: 'o5', mine: false } },
    { name: 'only my own', input: { order: 'o1', mine: true } },
    { name: 'no such order', input: { order: 'o404' } },
  ],
  walkRows: [{ name: 'the open orders', input: { vat: 0.2, big: 500 } }],
  payOrder: [
    { name: 'an open order', input: { order: 'o1', amount: 120 } },
    { name: 'built to fail: the order is paid', fails: true, input: { order: 'o3', amount: 80 } },
    { name: 'built to fail: no such order', fails: true, input: { order: 'o404', amount: 1 } },
  ],
  buyerLine: [
    { name: 'an order with its customer', input: { order: 'o1' } },
    { name: 'built to fail: no such order', fails: true, input: { order: 'o404' } },
    { name: 'built to fail: the customer of the order is not there', fails: true, input: { order: 'o4' } },
  ],
  refund: [
    { name: 'a charged order', input: { order: 'o1' } },
    { name: 'built to fail: never charged', fails: true, input: { order: 'o2' } },
    { name: 'built to fail: no such order', fails: true, input: { order: 'o404' } },
  ],
  eachWaits: [
    { name: 'three orders, one not there', input: { orders: ['o1', 'o404', 'o5'], to: 'boss@example.com' } },
    { name: 'no orders', input: { orders: [], to: 'boss@example.com' } },
  ],
  handles: [{ name: 'every handle', input: { to: 'maya@example.com', back: '/settings' } }],
  models: [
    { name: 'a calm message', input: { order: 'o1', message: 'Where is it', name: 'maya demir', run: 'run-4' } },
    { name: 'an angry message', input: { order: 'o3', message: 'Where is it!', name: 'ali kaya', run: 'run-5' } },
  ],
  awaitOrder: [
    {
      name: 'the fast side',
      input: { name: 'Deniz', charge: 'ch_1', order: 'o1', fast: true, skip: false, status: 'paid' },
    },
    {
      name: 'the other side',
      input: { name: 'Ece', charge: 'ch_3', order: 'o3', fast: false, skip: true, status: 'none' },
    },
  ],
  bigOrder: [
    { name: 'a customer that is there', event: { row: { id: 'o2', customer: 'c2', total: 640 } } },
    { name: 'a customer that is not there', event: { row: { id: 'o4', customer: 'c9', total: 1500 } } },
  ],
  flowTools: [
    { name: 'the event comes', input: { order: 'o1', patience: '5 days', ask: '1 day', to: 'maya@example.com' } },
    {
      name: 'the wait times out and a person says yes',
      input: { order: 'o1', patience: '2 days', ask: '1 day', to: 'maya@example.com' },
    },
    {
      name: 'the wait times out and a person says no',
      input: { order: 'o1', patience: '2 days', ask: '1 hour', to: 'maya@example.com' },
    },
  ],
}
