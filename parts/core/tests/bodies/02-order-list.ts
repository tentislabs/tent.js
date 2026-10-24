import { given, query } from 'tentjs'

const PAGE = 3

export const orderList = query('orderList', {
  access: 'everyone',
  run: ({ input, db }) =>
    db.orders
      .where({ status: given(input.status), total: { atLeast: input.least ?? 0 } })
      .with('customer')
      .newest('placedAt')
      .skip(input.skip ?? 0)
      .limit(input.limit ?? PAGE)
      .all(),
})
