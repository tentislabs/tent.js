import { action, boolean, change, choice, input, list, number, object, query, table, text } from 'tentjs'

export const orders = table('orders', {
  columns: {
    name: text(),
    total: number({ min: 0 }),
    status: choice(['open', 'paid'], { default: 'open' }),
    note: text({ optional: true }),
  },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const openOrders = query('openOrders', {
  access: 'signedIn',
  input: { limit: number({ default: 20, max: 100 }) },
  rows: orders.where({ status: 'open' }).limit(input('limit')),
})

export const paidOrders = query('paidOrders', {
  access: 'signedIn',
  heavy: true,
  rows: orders.where({ status: 'paid' }).limit(1000),
})

export const rates = action('rates', {
  access: 'signedIn',
  output: object({ EUR: number() }),
  run: async () => ({ EUR: 0.9 }),
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: {
    name: text(),
    total: number({ min: 0 }),
    status: choice(['open', 'paid'], { default: 'open' }),
    note: text({ optional: true }),
    address: object({ city: text() }, { optional: true }),
    tags: list(text(), { optional: true }),
    rush: boolean({ optional: true }),
  },
  set: orders.add({ name: input('name'), total: input('total'), status: input('status'), note: input('note') }),
})
