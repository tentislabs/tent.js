import { between, later, query } from 'tentjs'

export const twoMoments = query('twoMoments', {
  access: 'everyone',
  run: ({ input, db, now }) => {
    const order = db.orders.get(input.order)
    const again = db.orders.get(input.order)
    return {
      same: order.placedAt == again.placedAt,
      strict: order.placedAt === again.placedAt,
      itself: order.placedAt == order.placedAt,
      differ: order.placedAt != again.placedAt,
      notAfter: order.placedAt <= again.placedAt,
      notBefore: order.placedAt >= again.placedAt,
      apart: order.placedAt - again.placedAt,
      asText: order.placedAt == input.text,
      byWord: between(order.placedAt, again.placedAt, 'ms'),
      late: later(order.placedAt, '7 days') < now,
      age: between(order.placedAt, now, 'days'),
    }
  },
})
