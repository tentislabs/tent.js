import { input, number, query } from 'tentjs'
import { orders } from '../tables/shop'

export const openOrders = query('openOrders', {
  about: 'Open orders, newest first',
  input: { limit: number({ default: 50, max: 200 }) },
  access: 'signedIn',
  rows: orders.where({ status: 'open' }).with('customer').newest('placedAt').limit(input('limit')),
  // or:  run: ({ input, db, user, now }) => db.orders.where(...).all(),
  output: undefined,       // required when run answers anything but rows as db handed them, or a number
  live: true,              // false makes it one-shot
  refresh: undefined,      // '1 minute' for results that depend on the time
  offer: [],               // 'api', 'mcp', 'cli'
})
