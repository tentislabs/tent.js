import { change, number, query, table, text } from 'tentjs'

export const orders = table('orders', { columns: { status: text(), total: number() } })

export const orderStats = query('orderStats', {
  access: 'signedIn',
  input: {},
  run: ({ db }) => {
    const open = db.orders.count({ status: 'open' })
    return { open, all: db.orders.count({}) }
  },
})

export const orderLines = query('orderLines', {
  access: 'signedIn',
  input: {},
  run: ({ db }) => db.orders.all().map((one) => ({ id: one.id, money: `$${one.total}` })),
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { total: number() },
  run: ({ db, input }) => {
    const made = db.orders.add({ status: 'open', total: input.total })
    return { id: made.id, status: made.status }
  },
})
