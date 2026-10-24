import { boolean, change, input, link, list, role, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const orders = table('orders', {
  columns: { title: text(), placedBy: link('users'), paid: boolean({ default: false }) },
  owner: 'placedBy',
  access: { read: 'owner', add: 'signedIn', change: 'owner' },
})

export const markPaid = change('markPaid', {
  access: 'signedIn',
  system: 'an order is marked paid when its payment arrives',
  input: { order: link('orders') },
  set: orders.change(input('order'), { paid: true }),
})
