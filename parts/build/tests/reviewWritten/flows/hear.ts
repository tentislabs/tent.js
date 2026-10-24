import { event, flow } from 'tentjs'

export const hear = flow('hear', {
  on: event('run.failed', { where: { flow: 'billing' } }),
  run: async ({ step }) => {
    await step.wait('1 minute')
  },
})

export const paced = flow('paced', {
  run: async ({ step }) => {
    await step.wait('1 minute')
  },
  pace: { debounce: '30 seconds', drop: { max: 5, per: '1 hour' } },
})
