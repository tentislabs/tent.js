import { change, flow, input, now as clock, table, text } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn' } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

// Work inside a step, with the step tool under another name: nothing to report.
export const careful = flow('careful', {
  input: { title: text() },
  run: async ({ input, step: s }) => s('add', () => addOrder({ title: input.title })),
})

// A word that is drawn between two steps, imported under another name.
export const drawing = flow('drawing', {
  run: async ({ step }) => {
    const at = clock()
    return step('after', () => at)
  },
})
