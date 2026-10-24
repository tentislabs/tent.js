import { date, json, link, list, number, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const customers = table('customers', {
  columns: { name: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const orders = table('orders', {
  columns: {
    customer: link('customers'),
    owner: link('users'),
    total: number(),
    placedAt: date(),
    note: text({ optional: true, private: true }),
  },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn' },
})

export const notes = table('notes', {
  columns: { body: text(), meta: json({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn' },
})
