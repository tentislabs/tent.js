import { flow, model, post, secret, service, text } from 'tentjs'
import { orders } from '../tables/orders'

export const tellSales = flow('tellSales', {
  on: orders.added(),
  run: async ({ step }) => {
    await step.wait('1 day')
  },
})

export const sendTasks = flow('sendTasks', {
  access: 'signedIn',
  input: { to: text() },
  run: async ({ step }) => {
    await step.wait('1 day')
  },
})

export const slack = service('slack', {
  url: 'https://slack.com/api',
  auth: { bearer: secret('SLACK_TOKEN') },
  calls: { postMessage: post('/chat.postMessage', { input: { channel: text(), text: text() } }) },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })
