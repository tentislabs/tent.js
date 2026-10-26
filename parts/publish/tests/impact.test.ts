import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { impactOf, impactText } from '../index.ts'

const text = { kind: 'text' }
const number = { kind: 'number' }
const signedIn = { rule: 'signedIn' }
const anyone = { rule: 'anyone', why: 'a test' }
const staff = { rule: 'role', role: 'staff' }

/** A description of the parts it is handed, every other part empty, with each definition at a place of its own. */
function described(parts: Record<string, object>): Description {
  const places: Record<string, object> = {}
  for (const [part, records] of Object.entries(parts))
    if (part !== 'project')
      for (const name of Object.keys(records)) places[name] = { file: `${part}/${name}.ts`, from: 0, to: 10 }
  return Object({
    app: { name: 'shop' },
    project: {},
    tables: {},
    functions: {},
    flows: {},
    screens: {},
    components: {},
    services: {},
    models: {},
    routes: {},
    incoming: {},
    commands: {},
    messages: {},
    places,
    ...parts,
  })
}

const orders = (columns: object, more: object = {}): object => ({
  columns: { title: text, ...columns },
  access: { read: signedIn, add: signedIn, change: staff, remove: staff },
  ...more,
})

/** The app as it runs: a table of orders and one of notes, what reads and writes them, a flow, an agent, a service. */
const live = described({
  tables: {
    orders: orders({ total: number, note: { ...text, optional: true } }),
    notes: { columns: { body: text }, access: { read: staff, add: staff, change: staff, remove: staff } },
    unchanged: { columns: { word: text }, access: { read: staff, add: staff, change: staff, remove: staff } },
  },
  functions: {
    openOrders: { kind: 'query', form: 'plain', access: signedIn, reads: ['orders'], offer: ['api'] },
    addOrder: { kind: 'change', form: 'plain', access: signedIn, touches: ['orders'], input: { title: text } },
    staffNotes: { kind: 'query', form: 'plain', access: staff, reads: ['notes'] },
    pay: {
      kind: 'action',
      form: 'code',
      access: signedIn,
      offer: ['api'],
      input: { order: { ...text, optional: true } },
    },
    quiet: { kind: 'action', form: 'plain', body: [], access: signedIn },
    same: { kind: 'query', form: 'plain', access: staff, reads: ['unchanged'] },
  },
  flows: {
    fulfil: {
      form: 'plain',
      body: [
        { fn: 'step', args: ['pack', 1] },
        { fn: 'step', args: ['ship', 1] },
      ],
    },
    helper: {
      agent: { tools: ['openOrders', 'pay'], trust: ['openOrders'] },
      access: signedIn,
    },
  },
  screens: {
    ordersScreen: { path: '/orders', access: signedIn, data: { orders: { query: 'openOrders' } } },
  },
  services: { shipping: { url: 'https://ship.example.com', calls: {} } },
})

/** The project as it stands: one change of each kind at once. */
const next = described({
  tables: {
    // A column's type changes, a required column is added, a column is removed as the table states.
    orders: orders({ total: { kind: 'money' }, paid: { kind: 'boolean' } }, { removed: ['note'] }),
    // The rule of a table is widened.
    notes: { columns: { body: text }, access: { read: anyone, add: staff, change: staff, remove: staff } },
    unchanged: { columns: { word: text }, access: { read: staff, add: staff, change: staff, remove: staff } },
    // A table is added, and kept for a time.
    visits: { columns: { at: { kind: 'time' } }, lasts: { for: 2_592_000_000, by: 'at' } },
  },
  functions: {
    openOrders: { kind: 'query', form: 'plain', access: signedIn, reads: ['orders'], offer: ['api', 'mcp'] },
    addOrder: { kind: 'change', form: 'plain', access: signedIn, touches: ['orders'], input: { title: text } },
    // A rule widened: anyone may now call it.
    staffNotes: { kind: 'query', form: 'plain', access: anyone, reads: ['notes'] },
    // An input became required: a break for a caller outside.
    pay: { kind: 'action', form: 'code', access: signedIn, offer: ['api'], input: { order: text } },
    // Code now, which sends data out.
    quiet: { kind: 'action', form: 'code', access: signedIn },
    same: { kind: 'query', form: 'plain', access: staff, reads: ['unchanged'] },
  },
  flows: {
    // A step changed under runs that stand in it.
    fulfil: {
      form: 'plain',
      body: [
        { fn: 'step', args: ['pack', 2] },
        { fn: 'step', args: ['ship', 1] },
      ],
    },
    // A tool that asked a person no longer does.
    helper: {
      agent: { tools: ['openOrders', 'pay'], trust: ['openOrders', 'pay'] },
      access: signedIn,
    },
  },
  screens: {
    ordersScreen: { path: '/orders', access: signedIn, data: { orders: { query: 'openOrders' } } },
  },
  services: {
    shipping: { url: 'https://ship.example.com', calls: {} },
    // A new outside host.
    tracking: { url: 'https://track.example.org', calls: {} },
  },
  backfills: { splitTitles: { table: 'orders', page: 1000 } },
})

const facts = {
  callers: { pay: 12, openOrders: 40 },
  rows: { orders: 1500, visits: 0 },
  kept: { visits: 3 },
  runs: [{ flow: 'fulfil', step: 'pack', count: 3 }],
  touched: { 'orders.test.ts': ['openOrders', 'addOrder'], 'pay.test.ts': ['pay'] },
}

test('[44-2] the impact of each kind of change at once: wider rights, breaks for callers outside with their callers, data, work under way, what it reaches, tests and sends out, each in its part', () => {
  const impact = impactOf({ against: 'live', live, next, facts })
  assert.equal(impact.against, 'live')
  const named = (part: { name: string }[]) => part.map((one) => one.name)
  // Wider rights: a rule of a table and of a function widened, a function newly offered to MCP.
  assert.deepEqual(named(impact.rights).sort(), ['notes', 'openOrders', 'staffNotes'])
  const notes = impact.rights.find((one) => one.name === 'notes')
  assert.equal(notes?.change, 'now readable by anyone')
  assert.equal(impact.rights.find((one) => one.name === 'staffNotes')?.change, 'now callable by anyone')
  // Breaks for callers outside, with the callers of the last 30 days by the log: a column of a table that the API
  // returns, by the query offered there, is one.
  assert.deepEqual(
    impact.breaks.map((one) => [one.name, one.change, one.callers]),
    [
      ['openOrders', 'output.orders.note is no longer given', 40],
      ['pay', 'input.order became required', 12],
    ],
  )
  // Data: each table change with whether it is safe, stated or hard, and the rows it touches.
  const data = Object.fromEntries(impact.data.map((one) => [one.name, one]))
  assert.match(String(data['orders.total']?.change), /^number -> money, hard, 1500 rows$/)
  assert.match(String(data['orders.paid']?.change), /^added, required, hard, 1500 rows$/)
  assert.match(String(data['orders.note']?.change), /^removed, stated, 1500 rows$/)
  assert.match(
    String(impact.data.find((one) => one.name === 'visits' && one.kind === 'table')?.change),
    /^table added, safe/,
  )
  assert.match(String(data.splitTitles?.change), /^backfill of orders, 1500 rows$/)
  assert.match(
    String(impact.data.find((one) => one.name === 'visits' && one.kind === 'lasts')?.change),
    /^kept for 30 days by at, its first pass removes 3 rows$/,
  )
  // Work under way: the runs that stand in the changed step, and the line of a tool that changed.
  assert.deepEqual(
    impact.work.map((one) => [one.name, one.kind]),
    [
      ['fulfil.pack', 'step'],
      ['helper.pay', 'tool'],
    ],
  )
  assert.match(String(impact.work[0].change), /^3 runs stand in it, and keep their version$/)
  // What it reaches: the changed table to the functions that read it and the screens of those, and the offers.
  const reached = impact.reaches.find((one) => one.name === 'orders.total')
  assert.ok(reached)
  assert.match(JSON.stringify(reached.tree), /openOrders/)
  assert.match(JSON.stringify(reached.tree), /ordersScreen/)
  assert.equal(data['orders.total']?.reaches, 2)
  // Tests: what touched each changed definition in its last run, and what no test touches.
  assert.deepEqual(impact.tests.find((one) => one.name === 'openOrders')?.tests, ['orders.test.ts'])
  assert.ok(impact.untested.includes('staffNotes'))
  assert.equal(impact.untested.includes('openOrders'), false)
  // Sends out, asks a person: a function that now sends, a tool that no longer asks, a new outside host.
  assert.deepEqual(named(impact.out).sort(), ['helper.pay', 'quiet', 'tracking'])
  // Nothing for what did not change.
  assert.equal(JSON.stringify(impact).includes('unchanged'), false)
  assert.equal(JSON.stringify(impact).includes('"same"'), false)
  // Each finding names the file of its definition: a column, a step and a tool that of their owner.
  for (const part of [impact.rights, impact.breaks, impact.data, impact.work, impact.out])
    for (const one of part) {
      const owner = one.name.split('.')[0]
      const place = Object(Object(next.places)[owner] ?? Object(live.places)[owner])
      assert.equal(one.file, place.file, one.name)
    }
})

test('[44-2] each line of the impact names the definition, its file, what changed and where it leads, the weightiest part first, and nothing that did not change', () => {
  const impact = impactOf({ against: 'live', live, next, facts })
  const lines = impactText(impact, { rows: 100 }).split('\n')
  // The parts in their order, each under its heading, a part that is empty left out.
  const headings = lines.filter((line) => /^[A-Z]/.test(line))
  assert.deepEqual(headings, [
    'Impact against live',
    'Wider rights',
    'Breaks for callers outside',
    'Data',
    'Work under way',
    'What it reaches',
    'Tests',
    'Sends out, asks a person',
  ])
  assert.ok(
    lines.includes(
      '  orders.total (column, number -> money, hard, 1500 rows)  tables/orders.ts  reaches 1 function, 1 screen, 1 offered to the API, 1 offered to MCP',
    ),
    lines.join('\n'),
  )
  assert.ok(
    lines.includes(
      '  pay (action, input.order became required)  functions/pay.ts  used by 12 callers in the last 30 days',
    ),
  )
  assert.ok(lines.includes('  staffNotes (query, now callable by anyone)  functions/staffNotes.ts'))
  assert.equal(
    lines.some((line) => line.includes('unchanged') || line.includes(' same ')),
    false,
  )
  // In a terminal of fewer than 30 lines the counts of each part come first.
  const short = impactText(impact, { rows: 20 }).split('\n')
  assert.match(short[1], /^3 wider rights, 2 breaks, \d+ of data, 2 of work, \d+ reached, \d+ untested, 3 out$/)
})

test('[44-2] an impact with no change says so, and one with neither wider rights nor breaks asks for no acceptance', () => {
  const none = impactOf({ against: 'live', live, next: live })
  for (const part of [none.rights, none.breaks, none.data, none.work, none.reaches, none.tests, none.out])
    assert.deepEqual(part, [])
  assert.deepEqual(none.untested, [])
  assert.equal(impactText(none, { rows: 100 }), 'Impact against live\nNothing changed.')
})
