import { anyone, count, max, min, number, sum, table, text } from 'tentjs'
import { orders } from './orders'

const open = anyone('a test reads and writes it')

export const customers = table('customers', {
  columns: {
    name: text(),
    openOrders: number({ from: count({ of: orders, by: 'customer', where: { status: 'open' } }) }),
    spent: number({ from: sum({ of: orders, by: 'customer', column: 'total' }) }),
    least: number({ from: min({ of: orders, by: 'customer', column: 'total' }) }),
    most: number({ from: max({ of: orders, by: 'customer', column: 'total', where: { status: 'paid' } }) }),
  },
  access: { read: open, add: open, change: open, remove: open },
})
