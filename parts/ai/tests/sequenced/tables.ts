import { choice, link, list, number, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { item: text(), total: number(), status: choice(['open', 'paid']) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
})

export const refunds = table('refunds', {
  columns: { order: link('orders') },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const lates = table('lates', {
  columns: { order: link('orders') },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const receipts = table('receipts', {
  columns: { order: link('orders'), refund: link('refunds') },
  access: { read: 'signedIn', add: 'signedIn' },
})
