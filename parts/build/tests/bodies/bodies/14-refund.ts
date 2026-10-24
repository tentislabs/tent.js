import { action, fail } from 'tentjs'
import { reopen, stripe } from '../app/shop.ts'

export const refund = action('refund', {
  access: 'staff',
  system: 'staff refund any order, not only their own',
  run: async ({ input, user, db }) => {
    const order = await db.system.orders.get(input.order)
    if (!order?.chargeId) fail('not-charged', 'This order was never charged.')
    await stripe.createRefund({ charge: order.chargeId })
    await reopen({ order: order.id })
    return { ok: true, by: user.id }
  },
})
