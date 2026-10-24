import { action, each, mail, sum } from 'tentjs'

export const eachWaits = action('eachWaits', {
  access: 'everyone',
  run: async ({ input, db }) => {
    const totals = await each(input.orders, async (id, i) => {
      const order = await db.orders.get(id)
      if (!order) return 0
      await mail.send({ to: input.to, subject: `Order ${i + 1} of ${input.orders.length}`, text: `Total ${order.total}` })
      return order.total
    })
    const read = await each(input.orders, (id) => db.orders.get(id))
    return { totals, sum: sum(totals), buyers: each(read, (o) => o?.customer) }
  },
})
