import { change, flow, input, table, text } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn' } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

// The promise of neither step tool is awaited: the flow goes on before the step is saved.
export const hasty = flow('hasty', {
  input: { title: text() },
  run: async ({ input, step }) => {
    step('add', () => addOrder({ title: input.title }))
    step.wait('1 day')
    return 'done'
  },
})
