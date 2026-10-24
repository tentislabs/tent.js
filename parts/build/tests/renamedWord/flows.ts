import { event as eventNamed, flow } from 'tentjs'

// A flow that an event starts is handed `event`, which hides the word: the word is imported under another name.
export const deliveryWatch = flow('deliveryWatch', {
  on: eventNamed('order.shipped'),
  run: async ({ event, step }) => {
    const delivered = await step.waitFor(eventNamed('order.delivered'), { timeout: '10 days' })
    if (delivered.timedOut) await step('note', () => 'late')
    return { shipped: event.data }
  },
})
