// The app that the twenty bodies are written in: what they import. It is the app of the trial, written with the
// words of the part. No `run` here does anything: the test runtime answers each of these.
import { action, agent, change, flow, get, model, post, project, query, service, table } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  zone: 'Europe/Istanbul',
  languages: ['en', 'tr'],
  limits: { orders: { most: 50 } },
  identify: () => undefined,
})

export const orders = table('orders', { columns: {} })
export const customers = table('customers', { columns: {} })
export const payments = table('payments', { columns: {} })
export const videos = table('videos', { columns: {} })

export const orderTotal = query('orderTotal', { access: 'signedIn', run: () => undefined })
export const ordersPage = query('ordersPage', { access: 'signedIn', run: () => undefined })
export const markPaid = change('markPaid', { access: 'signedIn', run: () => undefined })
export const reopen = change('reopen', { access: 'signedIn', run: () => undefined })
export const addUser = change('addUser', { access: 'nobody', run: () => undefined })
export const sendReceipt = action('sendReceipt', { access: 'signedIn', background: true, follow: 'signedIn', run: async () => undefined })

export const invoiceApproval = flow('invoiceApproval', { run: async () => undefined })
export const sendWelcome = flow('sendWelcome', { follow: 'signedIn', run: async () => undefined })
export const encodeOne = flow('encodeOne', { run: async () => undefined })

export const stripe = service('stripe', { url: 'https://api.stripe.example', calls: { createRefund: post('/refunds'), getCharge: get('/charges/{id}') } })
export const slack = service('slack', { url: 'https://slack.example', calls: { postMessage: post('/chat.postMessage') } })
export const calendar = service('calendar', { url: 'https://calendar.example', calls: { listEvents: get('/events') } })

export const writer = model('writer', { provider: 'test', name: 'writer' })
export const painter = model('painter', { provider: 'test', name: 'painter', input: {}, output: { kind: 'json' } })
export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [], limits: { steps: 4, perRun: { calls: 4 } } })
