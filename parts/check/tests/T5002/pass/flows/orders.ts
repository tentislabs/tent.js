import { change, flow, input, table, text } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn' } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

// Each promise of a step tool is awaited, answered, or handed to `step.all`.
export const patient = flow('patient', {
  input: { title: text() },
  run: async ({ input, step }) => {
    await step('add', () => addOrder({ title: input.title }))
    await step.wait('1 day')
    const at = step.now()
    await step.all([() => step('one', () => 1), () => step('two', () => 2)])
    const later = step('later', () => at)
    await later
    return step('last', () => 'done')
  },
})
