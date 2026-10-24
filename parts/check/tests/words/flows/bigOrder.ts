import { flow, mail } from 'tentjs'
import { slack } from '../services/slack'
import { orders } from '../tables/shop'

export const bigOrder = flow('bigOrder', {
  on: orders.added({ where: { total: { above: 1000 } } }),
  run: async ({ event, step, db }) => {
    const customer = await step('find customer', () => db.customers.get(event.row.customer))
    if (!customer) return
    await step('tell sales', () => slack.postMessage({ channel: '#sales', text: `Big order from ${customer.name}` }))
    await step.wait('3 days')
    await step('follow up', () => mail.send({ to: customer.email, subject: 'How was your order?', text: 'Tell us how it went.' }))
  },
  limits: { steps: 1000, time: '30 days', result: '1 MB' },
  tries: 4,
  together: { max: 5 },
})
