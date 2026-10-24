import { anyone, choice, link, number, table } from 'tentjs'

const open = anyone('a test reads and writes it')

export const orders = table('orders', {
  columns: {
    customer: link('customers', { onRemove: 'remove' }),
    status: choice(['open', 'paid'], { default: 'open' }),
    total: number(),
  },
  access: { read: open, add: open, change: open, remove: open },
})
