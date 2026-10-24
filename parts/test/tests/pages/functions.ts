import { action, boolean, change, date, input, list, number, object, query, role, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { name: text(), total: number({ min: 0 }), placedAt: date({ default: 'now' }) },
  access: { read: 'anyone', add: 'anyone' },
})

export const openOrders = query('openOrders', {
  access: 'anyone',
  input: { limit: number({ default: 50 }) },
  rows: orders.oldest('name').limit(input('limit')),
})

// The orders as a query that is never watched: the page asks it again after each call that worked.
export const ordersOnce = query('ordersOnce', { access: 'anyone', live: false, rows: orders.oldest('name') })

export const staffOrders = query('staffOrders', { access: role('staff'), rows: orders.oldest('name') })

export const orderNamed = query('orderNamed', {
  access: 'anyone',
  input: { name: text({ pattern: '^[A-Za-z <>/&;]+$' }) },
  rows: orders.where({ name: input('name') }).first(),
})

export const addOrder = change('addOrder', {
  access: 'anyone',
  input: { name: text(), total: number({ min: 0 }), placedAt: date({ optional: true }) },
  set: orders.add({ name: input('name'), total: input('total'), placedAt: input('placedAt') }),
})

// What the function was handed for a moment, told back: a `Date` where the door made one.
export const whenIs = action('whenIs', {
  access: 'anyone',
  input: { at: date() },
  output: object({ isDate: boolean(), year: number() }),
  run: async ({ input }) => ({ isDate: input.at instanceof Date, year: input.at.getUTCFullYear() }),
})

export const rates = action('rates', {
  access: 'anyone',
  input: { base: text({ default: 'USD' }) },
  output: object({ base: text(), EUR: number() }),
  run: async ({ input }) => ({ base: input.base, EUR: 0.9 }),
})

export const staffRates = action('staffRates', {
  access: role('staff'),
  output: object({ EUR: number() }),
  run: async () => ({ EUR: 0.8 }),
})

export const failing = action('failing', {
  access: 'anyone',
  run: async () => {
    throw new Error('the outside service did not answer')
  },
})

// An action that writes: read as an entry of `data` it is called read-only, and its change is refused.
export const sneaky = action('sneaky', {
  access: 'anyone',
  run: async () => addOrder({ name: 'Sneaked', total: 1 }),
})

// A change whose input holds a switch.
export const rushOrder = change('rushOrder', {
  access: 'anyone',
  input: { name: text(), rush: boolean() },
  set: orders.add({ name: input('name'), total: 0 }),
})
