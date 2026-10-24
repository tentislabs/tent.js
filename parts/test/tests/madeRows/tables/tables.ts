import { boolean, choice, date, day, link, list, number, table, text } from 'tentjs'

export const customers = table('customers', {
  columns: { name: text({ unique: true }), tier: choice(['bronze', 'silver', 'gold']), tags: list(text()) },
  access: { read: 'anyone' },
})

export const orders = table('orders', {
  columns: {
    customer: link('customers'),
    total: number({ min: 0 }),
    placedAt: date(),
    due: day(),
    paid: boolean(),
    note: text({ optional: true }),
    state: choice(['open', 'shipped'], { default: 'shipped' }),
  },
  access: { read: 'anyone' },
})
