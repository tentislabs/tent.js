import { boolean, table, text } from 'tentjs'

export const orders = table('orders', {
  columns: { title: text(), paid: boolean({ default: false }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
})
