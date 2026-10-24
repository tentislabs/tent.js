import { change, flow, input, log, mail, now, query, random, runs, settings, start, table, text, token, concat } from 'tentjs'

export const orders = table('orders', { columns: { title: text() }, access: { read: 'signedIn' } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

export const openOrders = query('openOrders', { access: 'signedIn', rows: orders.limit(20) })

export const other = flow('other', { run: async ({ step }) => step('work', () => 1) })

// What matters stands inside a step, and what stands between the steps only reads.
export const careful = flow('careful', {
  input: { title: text() },
  run: async ({ input, step, db }) => {
    const open = openOrders()
    const count = await db.orders.count()
    const found = await runs.find({ flow: 'careful' })
    log.info('between two steps', { count, open: open.length, found: found.length })
    const label = concat(input.title, ' ', count)
    await step('add', () => addOrder({ title: label }))
    await step('call', () => other())
    await step('start', () => start(other))
    await step('mail', () => mail.send({ to: 'a@example.com', subject: 'Order', text: input.title }))
    const code = await step('code', () => [now(), random(), token()])
    const at = step.now()
    await step.all([() => step('one', () => addOrder({ title: 'one' })), () => step('two', () => addOrder({ title: 'two' }))])
    return [code, at]
  },
})
