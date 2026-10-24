import { change, flow, input, table, text } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn' } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

// Two mistakes that only the types show: a number where the change takes a text, and a field that the step never answered.
export const sorted = flow('sorted', {
  input: { title: text() },
  run: async ({ input, step }) => {
    const saved = await step('count', () => ({ count: 1, title: input.title }))
    await step('good', () => addOrder({ title: saved.title }))
    await step('bad', () => addOrder({ title: 5 }))
    const missing = saved.nothere
    return [saved.count, missing]
  },
})
