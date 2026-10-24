import { anyone, list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { item: text() },
  access: { read: anyone('the shop shows its orders'), add: anyone('anyone may order') },
})
