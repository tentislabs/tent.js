import { action, anyone, number, query, secrets, text } from 'tentjs'
import { orders } from '../tables/orders.ts'

const open = anyone('the shop is open to anyone')

export const openOrders = query('openOrders', { access: open, rows: orders.newest('createdAt').limit(100) })

// The screen of the app asks the person for the key of a service, and keeps it as a secret of the app's own.
export const setKey = action('setKey', {
  access: open,
  system: 'the owner of the server sets the key of its service',
  input: { value: text() },
  run: async ({ input }) => secrets.set('PAY_KEY', input.value),
})

export const keyLength = action('keyLength', {
  access: open,
  output: number(),
  run: async () => secrets.PAY_KEY.reveal().length,
})
