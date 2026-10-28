import { input, number, query } from 'tentjs'
import { orders } from '../tables/orders'

export const openOrders = query('openOrders', {
  access: 'signedIn',
  input: { limit: number() },
  rows: orders.where({ paid: false }).limit(input('limit')),
})
