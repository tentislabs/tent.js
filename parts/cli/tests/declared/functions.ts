import { action, allow, anyone, boolean, change, choice, input, link, list, number, query, role, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const orders = table('orders', {
  columns: {
    title: text({ min: 1, max: 40 }),
    total: number({ min: 0, max: 1000 }),
    owner: link('users', { optional: true }),
  },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn', change: role('staff'), remove: 'nobody' },
})

// A function of each kind of rule: nobody, signed in, a role, anyone, and a rule written as code.
export const hidden = query('hidden', { access: 'nobody', output: text(), run: () => 'hidden' })

export const listOrders = query('listOrders', { access: 'signedIn', rows: orders.where({}).limit(20) })

export const refundOrder = change('refundOrder', {
  access: role('staff'),
  input: { order: link('orders') },
  set: orders.change(input('order'), { total: 0 }),
})

export const openNow = query('openNow', {
  access: anyone('it tells anyone whether the shop is open'),
  output: boolean(),
  run: () => true,
})

export const staffDesk = query('staffDesk', {
  access: allow((user) => user?.roles.includes('staff') === true),
  output: text(),
  run: () => 'the desk',
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text({ min: 1, max: 40 }), total: number({ min: 0, max: 1000 }) },
  set: orders.add({ title: input('title'), total: input('total') }),
})

// A choice of sizes, each of which a case calls.
export const pick = action('pick', {
  access: 'signedIn',
  input: { size: choice(['small', 'large']), note: text({ optional: true }) },
  output: text(),
  run: async ({ input: given }) => given.size,
})
