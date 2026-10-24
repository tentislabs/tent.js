import { query } from 'tentjs'

export const orderById = query('orderById', {
  access: 'everyone',
  run: ({ input, db }) => db.orders.get(input.order),
})
