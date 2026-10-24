import { change, flow, input, list, table, text } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn' } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

// Steps that nothing waits for, written other ways than as a statement of their own.
export const hasty = flow('hasty', {
  input: { titles: list(text()) },
  run: async ({ input, step }) => {
    void step('first', () => 1)
    input.titles.forEach((title) => step(title, () => addOrder({ title })))
    step('then', () => 2).then(() => undefined)
    return 'done'
  },
})
