import { choice, date, file, link, number, table, text } from 'tentjs'

export const orders = table('orders', {
  columns: {
    customer: link('customers'),
    placedBy: link('users'),
    total: number({ min: 0, whole: true }),
    note: text({ optional: true, max: 2000 }),
    status: choice(['open', 'paid', 'shipped'], { default: 'open' }),
    placedAt: date({ default: 'now' }),
    receipt: file({ optional: true, kinds: ['application/pdf'] }),
  },
  owner: 'placedBy',
  access: { read: 'owner', change: 'owner' },
})
