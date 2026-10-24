import { change, input, link } from 'tentjs'
import { orders } from '../tables/shop'

export const markPaid = change('markPaid', {
  input: { order: link('orders') },
  access: 'signedIn',
  set: orders.change(input('order'), { status: 'paid' }),
  // or:  run: ({ input, db, user, now }) => { ... },
  danger: 'none',          // 'ask' makes AIs and MCP callers ask a person first
  offer: [],
})
