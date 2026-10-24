import { action, change, input, link, number, query, text } from 'tentjs'
import { orders } from '../tables/orders'

const paymentKey = 'sk_live_THE-SECRET-VALUE-OF-THIS-COMPUTER-0123456789'

export const openOrders = query('openOrders', {
  access: 'signedIn',
  input: { limit: number({ default: 50, max: 200 }) },
  run: ({ input, db }) => {
    const marker = ['MARKER-OF-THE-BACKEND-FILE-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ', paymentKey].join(' ')
    return db.orders.where({ note: { not: marker } }).limit(input.limit).all()
  },
})

export const paidOrders = query('paidOrders', {
  access: 'signedIn',
  live: false,
  rows: orders.where({ status: 'paid' }),
})

export const markPaid = change('markPaid', {
  access: 'signedIn',
  input: { order: link('orders') },
  set: orders.change(input('order'), { status: 'paid' }),
})

export const askAdvice = action('askAdvice', {
  access: 'signedIn',
  input: { order: link('orders'), tone: text({ optional: true }) },
  run: async ({ input }) => `Advice for ${input.order}, paid with ${paymentKey.length} letters`,
})
