import { change, flow, input, mail, now, query, random, start, table, text, token } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn' } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

export const openOrders = query('openOrders', { access: 'signedIn', rows: orders.limit(20) })

export const other = flow('other', { run: async ({ step }) => step('work', () => 1) })

// Each of these stands between two steps, where the code runs again on every pass.
export const careless = flow('careless', {
  input: { title: text() },
  run: async ({ input, step }) => {
    addOrder({ title: input.title })
    await other()
    start(other)
    await mail.send({ to: 'a@example.com', subject: 'Order', text: input.title })
    const at = now()
    const pick = random()
    const code = token()
    return step('after', () => [at, pick, code])
  },
})
