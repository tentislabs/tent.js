import { action, boolean, change, fail, input, link, object, role, text } from 'tentjs'
import { stripe } from '../services/stripe'
import { orders } from '../tables/shop'

export const reopen = change('reopen', {
  input: { order: link('orders') },
  access: role('staff'),
  system: 'staff reopen any order, not only their own',     // the table lets only the owner change a row
  set: orders.change(input('order'), { status: 'open', chargeId: null }),
})

export const refund = action('refund', {
  input: { order: link('orders'), reason: text({ max: 500 }) },
  access: role('staff'),
  system: 'staff refund any order, not only their own',
  danger: 'ask',
  output: object({ ok: boolean() }),
  run: async ({ input, user, db }) => {
    const order = await db.system.orders.get(input.order)   // read-only here; get answers a row or nothing
    if (!order?.chargeId) fail('not-charged', 'This order was never charged.')
    await stripe.createRefund({ charge: order.chargeId })
    await reopen({ order: order.id })                    // writes go through a change, which passes its own rule
    return { ok: true }
  },
})
