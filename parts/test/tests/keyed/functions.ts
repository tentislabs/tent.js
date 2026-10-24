import {
  action,
  anyone,
  boolean,
  change,
  choice,
  connections,
  date,
  day,
  file,
  flow,
  json,
  keys,
  link,
  list,
  number,
  object,
  query,
  role,
  route,
  table,
  text,
} from 'tentjs'
import { github, weather } from './services'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: {
    title: text(),
    total: number({ optional: true }),
    placedBy: link('users', { optional: true }),
    doc: file({ optional: true }),
  },
  owner: 'placedBy',
  access: { read: 'owner', add: 'signedIn', change: 'owner' },
})

export const totals = query('totals', {
  about: 'The total of every order, for the staff',
  access: role('staff'),
  system: 'sums the orders of every caller',
  offer: ['api'],
  input: {},
  output: number(),
  run: ({ db }) => db.system.orders.all().reduce((sum, one) => sum + (one.total ?? 0), 0),
})

export const myOrders = query('myOrders', {
  about: 'The orders of the caller',
  access: 'signedIn',
  offer: ['api'],
  input: {},
  output: list(object({ title: text() })),
  run: ({ db }) => db.orders.all().map((one) => ({ title: one.title })),
})

// A query of every kind of field that the address of a `GET` takes.
export const echo = query('echo', {
  about: 'Answers what it was handed',
  access: 'signedIn',
  offer: ['api'],
  input: {
    words: text({ optional: true }),
    count: number({ optional: true }),
    done: boolean({ optional: true }),
    at: date({ optional: true }),
    on: day({ optional: true }),
    pick: choice(['a', 'b'], { optional: true }),
    tags: list(text(), { optional: true }),
    more: json({ optional: true }),
  },
  output: json(),
  run: ({ input }) => ({ ...input, ...(input.at ? { at: input.at.toISOString() } : {}) }),
})

export const addOrder = change('addOrder', {
  about: 'Adds an order of the caller',
  access: 'signedIn',
  offer: ['api'],
  input: { title: text(), total: number({ optional: true }) },
  run: ({ input, db, user }) => db.orders.add({ title: input.title, total: input.total, placedBy: user?.id }),
})

// Answers nothing: the API answers it with 204.
export const forget = change('forget', {
  about: 'Does <b>nothing</b>',
  access: 'signedIn',
  offer: ['api'],
  input: {},
  run: () => undefined,
})

export const oldTotals = query('oldTotals', {
  about: 'The totals, before a new function took over',
  access: 'signedIn',
  offer: ['api'],
  deprecated: '2027-01-31',
  input: {},
  output: number(),
  run: () => 0,
})

// A function that asks a person before it runs.
export const refundAll = action('refundAll', {
  about: 'Refunds every order',
  access: 'signedIn',
  offer: ['api'],
  danger: 'ask',
  input: { reason: text() },
  output: text(),
  run: async ({ input }) => `refunded for ${input.reason}`,
})

// Not offered to the API.
export const hidden = query('hidden', { access: 'signedIn', input: {}, output: text(), run: () => 'hidden' })

// A function of one scope that calls another inside.
export const outer = action('outer', {
  access: 'signedIn',
  offer: ['api'],
  input: {},
  output: text(),
  run: async () => `outer and ${await inner({})}`,
})

export const inner = query('inner', { access: 'signedIn', input: {}, output: text(), run: () => 'inner' })

export const keepFile = action('keepFile', {
  access: 'signedIn',
  offer: ['api'],
  input: { doc: file() },
  output: text(),
  run: async ({ input }) => input.doc,
})

export const holdFile = change('holdFile', {
  access: 'signedIn',
  offer: ['api'],
  input: { title: text(), doc: file() },
  run: ({ input, db, user }) => db.orders.add({ title: input.title, doc: input.doc, placedBy: user?.id }),
})

export const forecast = action('forecast', {
  access: 'signedIn',
  input: { city: text() },
  output: json(),
  run: async ({ input }) => weather.today({ city: input.city }),
})

export const issues = action('issues', {
  access: 'signedIn',
  input: {},
  output: json(),
  run: async () => github.listIssues({}),
})

// A command of the app's own command line.
export const whoCalls = query('whoCalls', {
  access: anyone('a test reads who calls'),
  offer: ['cli'],
  input: {},
  output: text(),
  run: ({ user }) => user?.id ?? 'nobody',
})

export const startConnect = action('startConnect', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => connections.start('github'),
})

export const report = route('report', {
  method: 'GET',
  path: '/report',
  access: 'signedIn',
  run: async () => new Response('the report'),
})

// A route of the builder's own under `/api/`, tried before the functions that are offered there.
export const orderById = route('orderById', {
  method: 'GET',
  path: '/api/orders/:id',
  access: 'signedIn',
  run: async ({ params }) => Response.json({ id: params.id }),
})

export const makeKey = action('makeKey', {
  access: anyone('a test makes the keys it uses'),
  system: 'makes keys for the tests',
  input: { o: json() },
  output: json(),
  run: async ({ input }) => keys.add(Object(input.o)),
})

export const listKeys = action('listKeys', {
  access: anyone('a test reads the keys'),
  system: 'lists keys for the tests',
  input: { user: text({ optional: true }) },
  output: list(
    object({
      id: text(),
      name: text(),
      scopes: list(text()),
      roles: list(text()),
      user: text({ optional: true }),
      perMinute: number(),
      asks: text({ optional: true }),
      createdAt: date(),
      lastUsedAt: date({ optional: true }),
      expiresAt: date({ optional: true }),
    }),
  ),
  run: async ({ input }) => keys.list(input.user ? { user: input.user } : {}),
})

export const removeKey = action('removeKey', {
  access: anyone('a test removes a key'),
  system: 'removes keys for the tests',
  input: { id: text() },
  run: async ({ input }) => keys.remove(input.id),
})

export const sneakKey = action('sneakKey', {
  access: anyone('a test makes a key with no full access'),
  input: {},
  output: json(),
  run: async () => keys.add({ name: 'sneaked' }),
})

// A run that outlives the key that started it.
export const outlives = flow('outlives', {
  as: 'starter',
  run: async ({ step }) => {
    await step('before', () => 'done')
    await step.wait('1 hour')
    await step('after', () => addOrder({ title: 'after the wait' }))
  },
})

export const weekly = flow('weekly', {
  about: 'Adds the totals of the week',
  access: 'signedIn',
  offer: ['api'],
  as: 'starter',
  input: { week: number() },
  output: json(),
  run: async ({ input, step }) => step('add', () => ({ week: input.week, sum: input.week * 2 })),
})
