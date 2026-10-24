import { anyone, number, query, text } from 'tentjs'

/** Work that keeps a query busy past the slow bar, with no clock, which a query cannot read. */
function busy(): number {
  let sum = 0
  for (let i = 0; i < 150_000_000; i++) sum += i % 7
  return sum
}

export const firstOpen = query('firstOpen', {
  access: anyone('a test reads the orders'),
  input: {},
  output: number(),
  run: ({ db }) => db.orders.where({ status: 'open' }).sort('placedAt').limit(5).all().length + (busy() > 0 ? 0 : 1),
})

export const customerNamed = query('customerNamed', {
  access: anyone('a test reads the customers'),
  input: { name: text() },
  output: number(),
  run: ({ db, input }) => db.customers.where({ name: input.name }).all().length + (busy() > 0 ? 0 : 1),
})
