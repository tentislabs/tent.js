import { cron, event, every, flow, incoming, link, mail, object, text } from 'tentjs'
import { markPaid } from '../functions/orders'
import { orders } from '../tables/shop'

export const bigOrder = flow('bigOrder', {
  on: [orders.added({ where: { net: { above: 1000 } } }), orders.changed({ columns: ['status'] }), every('day at 09:00'), cron('0 9 * * 1', { zone: 'UTC' }), event('order.shipped')],
  about: 'Follows a big order up',
  input: { order: link('orders') },
  output: object({ ended: text() }),
  run: async ({ event, input, step, db }) => {
    const at = await step.now()
    const order = await step('find order', () => db.orders.get(event?.row?.id ?? input.order))
    if (!order) return { ended: 'gone' }
    const told = await step.all([() => step('mail sales', () => mail.send({ to: 'sales@example.com', subject: 'Big order', text: `Order ${order.id}` })), () => step.wait('1 minute')])
    await step.wait('3 days')
    const paid = await step('mark paid', async () => {
      const marked = await markPaid({ order: order.id })
      return marked.status
    }, { tries: 2 })
    for (const one of told) {
      await step('note', () => db.orders.count())
    }
    return { ended: paid === 'paid' ? `paid at ${at}` : 'open' }
  },
  onFail: async ({ failure, step }) => {
    await step('tell owner', () => mail.send({ to: 'owner@example.com', subject: 'A run failed', text: failure.message }))
  },
  limits: { steps: 200, time: '30 days', result: '1 MB', wait: '1 year' },
  tries: { max: 5, wait: '10 seconds' },
  together: { max: 5, then: 'refuse' },
  moveRuns: 'whenSafe',
})

export const paymentReceived = flow('paymentReceived', {
  input: { order: link('orders') },
  run: async ({ input, step }) => {
    await step('mark paid', () => markPaid({ order: input.order }))
  },
})

export const stripeEvents = incoming('stripeEvents', {
  path: '/hooks/stripe',
  open: 'the sender is held by its address in front of the app',
  limits: { size: '4 MB' },
  then: paymentReceived,
})
