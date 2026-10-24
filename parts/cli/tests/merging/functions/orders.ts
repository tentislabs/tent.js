import { action, change, input, number, query, text } from 'tentjs'
import { orders } from '../tables/orders'

// The orders that are not paid yet, oldest first.
export const openOrders = query('openOrders', {
  access: 'signedIn',
  input: { limit: number() },
  rows: orders.where({ paid: false }).oldest('createdAt').limit(input('limit')),
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text({ min: 1 }), total: number() },
  set: orders.add({ title: input('title'), total: input('total'), state: 'open' }),
})

export const refund = action('refund', {
  access: 'signedIn',
  input: { order: text() },
  run: async ({ input: given }) => {
    const first = given.order.trim()
    const second = first.toUpperCase()
    const third = second.slice(0, 4)
    const fourth = third.padEnd(8, '-')
    return fourth.toLowerCase()
  },
})
