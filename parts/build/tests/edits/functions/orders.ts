import { change, input, link, number, query } from 'tentjs'
import { orders } from '../tables/orders'

export const openOrders = query('openOrders', {
  access: 'signedIn',
  input: { limit: number({ default: 50, max: 200 }) },
  rows: orders.where({ status: 'open' }).with('customer').limit(input('limit')),
})

export const markPaid = change('markPaid', {
  access: 'signedIn',
  input: { order: link('orders') },
  set: orders.change(input('order'), { status: 'paid' }),
})
