import { action, change, flow, link, list, log, model, post, query, secret, secrets, service, start, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) } })

export const orders = table('orders', {
  columns: { title: text() },
  access: { read: 'anyone', add: 'anyone' },
})

export const lines = table('lines', {
  columns: { order: link('orders'), note: text() },
  access: { read: 'anyone', add: 'anyone' },
})

// A model of the project's own provider, which answers with what it used.
export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply'] })

// The address is written anew by the test, with the port of its stand-in.
export const shipping = service('shipping', {
  url: 'http://127.0.0.1:1',
  auth: { bearer: secret('SHIPPING_KEY') },
  calls: { quote: post('/quote', { input: { order: text() } }) },
})

// The work an order sets off: a model writes a note, and the shipping service quotes it.
export const fulfil = flow('fulfil', {
  input: { order: text() },
  run: async ({ input, step }) => {
    const note = await step('write', () => writer.reply(`Write a note for the order ${input.order}.`))
    const quote = await step('quote', () => {
      log.info(`quoted with the key ${secrets.SHIPPING_KEY.reveal()}`)
      return shipping.quote({ order: input.order })
    })
    return { note, quote }
  },
})

// A press writes two tables and starts the work: what it was handed stands in no span.
export const placeOrder = change('placeOrder', {
  access: 'anyone',
  input: { title: text(), note: text() },
  output: text(),
  run: ({ input, db }) => {
    const order = db.orders.add({ title: input.title })
    db.lines.add({ order: order.id, note: input.note })
    db.lines.add({ order: order.id, note: `${input.note} again` })
    log.info('placed')
    start(fulfil, { order: order.id })
    return order.id
  },
})

// A change whose code breaks: the caller is told a ref and the trace.
export const breakOrder = change('breakOrder', {
  access: 'anyone',
  input: { title: text() },
  run: ({ input, db }) => {
    db.orders.add({ title: input.title })
    throw new RangeError(`the order ${input.title} broke`)
  },
})

export const countOrders = query('countOrders', {
  access: 'anyone',
  input: {},
  run: ({ db }) => db.orders.count(),
})

// An action whose work is a worker's.
export const heavyCount = action('heavyCount', {
  access: 'anyone',
  input: {},
  worker: 'heavy',
  run: async ({ db }) => db.orders.count(),
})
