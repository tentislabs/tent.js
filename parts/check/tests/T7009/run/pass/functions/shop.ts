import { action, change, flow, number, object, text } from 'tentjs'
import { addOrder } from './orders'

// Takes what the change answers, which states its `output`.
export const orderNow = action('orderNow', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => {
    const made = await addOrder({ total: 1 })
    return made.id
  },
})

// A change whose record no code takes: a step hands it on, and nothing reads the step.
export const countOpen = change('countOpen', {
  access: 'signedIn',
  input: {},
  run: ({ db }) => {
    for (const one of db.orders.where({ status: 'new' }).all()) db.orders.change(one.id, { status: 'open' })
    return { open: db.orders.count({ status: 'open' }) }
  },
})

export const openEach = flow('openEach', {
  about: 'Opens every new order',
  input: {},
  output: object({ done: number() }),
  run: async ({ step }) => {
    await step('open', () => countOpen())
    return { done: 1 }
  },
})
