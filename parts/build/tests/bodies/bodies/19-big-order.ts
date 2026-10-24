import { flow, mail } from 'tentjs'
import { slack } from '../app/shop.ts'

export const bigOrder = flow('bigOrder', {
  run: async ({ event, step, db }) => {
    const customer = await step('find customer', () => db.customers.get(event.row.customer))
    if (!customer) return
    await step('tell sales', () => slack.postMessage({ channel: '#sales', text: `Big order from ${customer.name}` }))
    await step.wait('3 days')
    await step('follow up', () => mail.send({ to: customer.email, subject: 'How was your order?', text: 'Tell us how it went.' }))
  },
})
