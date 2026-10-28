import { action, change, input, role, text } from 'tentjs'
import { orders } from '../tables/orders'

export const markPaid = change('markPaid', {
  access: role('staff'),
  input: { order: text() },
  set: orders.change(input('order'), { paid: true }),
})

// An action whose own code fails.
export const broken = action('broken', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => {
    const parts: string[] = []
    if (parts.length === 0) throw new Error('the parts are gone')
    return parts.join('')
  },
})
