import { choice, date, number, table, text } from 'tentjs'

export const customers = table('customers', {
  columns: { name: text() },
  indexes: [['name']],
  access: { read: 'anyone' },
})

// No index: a read of the open orders by the moment they were placed reads the whole table.
export const orders = table('orders', {
  columns: { status: choice(['open', 'paid']), placedAt: date(), total: number() },
  access: { read: 'anyone' },
})
