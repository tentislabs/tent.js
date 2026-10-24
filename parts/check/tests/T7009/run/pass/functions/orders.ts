import { change, list, number, object, query, table, text } from 'tentjs'

export const orders = table('orders', { columns: { status: text(), total: number() } })

// A record that states its `output` is answered through it.
export const orderStats = query('orderStats', {
  access: 'signedIn',
  input: {},
  output: object({ open: number(), all: number() }),
  run: ({ db }) => {
    const open = db.orders.count({ status: 'open' })
    return { open, all: db.orders.count({}) }
  },
})

export const orderLines = query('orderLines', {
  access: 'signedIn',
  input: {},
  output: list(object({ id: text(), money: text() })),
  run: ({ db }) => db.orders.all().map((one) => ({ id: one.id, money: `$${one.total}` })),
})

// Rows as `db` handed them, and a number, need no `output`.
export const openOrders = query('openOrders', {
  access: 'signedIn',
  input: {},
  run: ({ db }) => db.orders.where({ status: 'open' }).all().filter((one) => one.total > 0),
})

export const orderCount = query('orderCount', {
  access: 'signedIn',
  input: {},
  run: ({ db }) => db.orders.count({}),
})

// A change whose answer is a record states its `output`; one that answers nothing needs none.
export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { total: number() },
  output: object({ id: text(), status: text() }),
  run: ({ db, input }) => {
    const made = db.orders.add({ status: 'open', total: input.total })
    return { id: made.id, status: made.status }
  },
})

export const closeAll = change('closeAll', {
  access: 'signedIn',
  input: {},
  run: ({ db }) => {
    for (const one of db.orders.where({ status: 'open' }).all()) db.orders.change(one.id, { status: 'closed' })
  },
})
