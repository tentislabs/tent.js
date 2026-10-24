import { agent, change, flow, link, list, model, number, object, post, project, query, secret, service, table, text } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  languages: ['en', 'tr'],
  mail: { from: 'shop@example.com', send: secret('SMTP_URL') },
})

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })
export const invoices = table('invoices', { columns: { total: number() }, access: { read: 'signedIn' } })
export const orders = table('orders', { columns: { status: text(), placedAt: text() }, access: { read: 'signedIn' } })
export const payments = table('payments', { columns: { invoice: link('invoices'), amount: number() }, access: { read: 'signedIn' } })
export const videos = table('videos', { columns: { state: text() }, access: { read: 'signedIn' } })

export const ordersPage = query('ordersPage', { access: 'signedIn', input: { after: text({ optional: true }) }, rows: orders.limit(20) })
export const markPaid = change('markPaid', { access: 'signedIn', input: { order: link('orders') }, set: orders.change('o1', { status: 'paid' }) })
export const addUser = change('addUser', { access: 'nobody', set: users.add({ roles: [] }) })

export const sendWelcome = flow('sendWelcome', { follow: 'signedIn', run: async () => {} })
export const bigOrder = flow('bigOrder', { input: { order: link('orders') }, run: async () => {} })
export const encodeOne = flow('encodeOne', { input: { id: link('videos') }, run: async () => {} })

export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  calls: { createRefund: post('/v1/refunds', { input: { charge: text() }, output: object({ id: text() }) }) },
})
export const calendar = service('calendar', { url: 'https://calendar.example.com', auth: { oauth: { authorizeUrl: 'https://calendar.example.com/a', tokenUrl: 'https://calendar.example.com/t', clientId: 'shop', clientSecret: secret('CALENDAR') } } })
export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })
export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [ordersPage], limits: { steps: 4, perRun: { tokensOut: 1000 } } })
