import { action, number, object, role, text } from 'tentjs'
import { payments } from '../services/services'

export const lookUpOrder = action('lookUpOrder', {
  about: 'Looks an order up at the payment service by its id: its total, its currency, its status and its email',
  access: role('staff'),
  changes: false,
  sends: false,
  input: { order: text({ min: 1, max: 100 }) },
  output: object({ id: text(), total: number(), currency: text(), status: text(), email: text() }),
  run: ({ input }) => payments.getOrder({ id: input.order }),
})

export const refundOrder = action('refundOrder', {
  about: 'Refunds an order in full at the payment service. A person says yes first',
  access: role('staff'),
  danger: 'ask',
  input: { order: text({ min: 1, max: 100 }) },
  output: object({ id: text(), status: text() }),
  run: ({ input }) => payments.refundOrder({ id: input.order }),
})
