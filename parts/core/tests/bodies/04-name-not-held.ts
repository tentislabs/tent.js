import { query } from 'tentjs'

export const nameNotHeld = query('nameNotHeld', {
  access: 'everyone',
  run: ({ input, db }) => {
    const order = db.orders.get(input.order)
    return {
      noteLength: input.note.length,
      tags: input.tags.length,
      asText: order.toString,
      sameMaker: order.constructor === input.extra.constructor,
      sameFixed: order.total.toFixed === input.count.toFixed,
      trimmed: input.note.trim,
      missing: order.nowhere,
      deep: order.nowhere?.deeper.still,
    }
  },
})
