import { action, json, post, service, text } from 'tentjs'

export const pay = service('pay', {
  url: 'https://pay.example',
  calls: { charge: post('/charge', { input: { order: text() } }) },
})

export const charge = action('charge', {
  access: 'signedIn',
  input: { order: text() },
  output: json(),
  run: async ({ input }) => pay.charge({ order: input.order }),
})
