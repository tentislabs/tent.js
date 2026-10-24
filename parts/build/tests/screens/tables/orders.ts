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
    photo: text({ optional: true }),
  },
  access: { read: 'signedIn', change: 'signedIn' },
})

export const notes = table('notes', {
  columns: { note: text(), source: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})
