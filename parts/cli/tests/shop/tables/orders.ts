import { boolean, link, role, table, text } from 'tentjs'

export const orders = table('orders', {
  columns: { title: text(), owner: link('users'), paid: boolean({ default: false }) },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn', change: role('staff'), remove: role('staff') },
})
