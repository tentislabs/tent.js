import { choice, link, number, table, text } from 'tentjs'

export const customers = table('customers', {
  columns: { name: text() },
  access: { read: 'signedIn' },
})

export const orders = table('orders', {
  columns: {
    customer: link('customers'),
    total: number({ min: 0 }),
    status: choice(['open', 'paid'], { default: 'open' }),
  },
  access: { read: 'signedIn', change: 'signedIn' },
})
