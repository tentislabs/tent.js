import {
  calc,
  caller,
  change,
  choice,
  fail,
  file,
  given,
  input,
  link,
  list,
  number,
  object,
  query,
  role,
  text,
} from 'tentjs'
import { orders } from '../tables/orders'

const PAGE = 20

export const ordersByStatus = query('ordersByStatus', {
  about: 'One page of twenty orders of one status, newest first, with the customer of each, narrowed by a name',
  input: {
    status: choice(['open', 'paid', 'shipped']),
    page: number({ default: 1, min: 1, whole: true }),
    search: text({ default: '', max: 200 }),
  },
  access: role('staff'),
  system: 'staff see every order, not only their own',
  rows: orders
    .where({ status: input('status'), 'customer.name': { contains: given(input('search')) } })
    .with('customer')
    .newest('placedAt')
    .skip(calc('*', calc('-', input('page'), 1), PAGE))
    .limit(PAGE),
})

export const orderCount = query('orderCount', {
  about: 'How many orders of one status a name narrows to, for the pager',
  input: { status: choice(['open', 'paid', 'shipped']), search: text({ default: '', max: 200 }) },
  access: role('staff'),
  system: 'staff count every order, not only their own',
  rows: orders.where({ status: input('status'), 'customer.name': { contains: given(input('search')) } }).count(),
})

export const myOrders = query('myOrders', {
  about: "The caller's own orders, newest first",
  access: 'signedIn',
  rows: orders
    .where({ placedBy: caller('id') })
    .with('customer')
    .newest('placedAt')
    .limit(200),
})

export const orderStats = query('orderStats', {
  about:
    'What the overview shows: the count and the sum of each status, the takings of each month, and the best customers',
  access: role('staff'),
  system: 'staff see the sums of every order',
  output: object({
    statuses: list(object({ status: choice(['open', 'paid', 'shipped']), count: number(), total: number() })),
    months: list(object({ month: text(), taken: number(), open: number() })),
    buyers: list(object({ name: text(), count: number(), total: number() })),
  }),
  run: ({ db }) => {
    const all = db.system.orders.where({}).with('customer').newest('placedAt').all()
    const statuses = (['open', 'paid', 'shipped'] as const).map((status) => {
      const of = all.filter((order) => order.status === status)
      return { status, count: of.length, total: of.reduce((sum, order) => sum + order.total, 0) }
    })
    const months = new Map<string, { month: string; taken: number; open: number }>()
    const buyers = new Map<string, { name: string; count: number; total: number }>()
    for (const order of all) {
      const month = order.placedAt.toISOString().slice(0, 7)
      const entry = months.get(month) ?? { month, taken: 0, open: 0 }
      if (order.status === 'open') entry.open += order.total
      else entry.taken += order.total
      months.set(month, entry)
      const buyer = buyers.get(order.customer.id) ?? { name: order.customer.name, count: 0, total: 0 }
      buyer.count += 1
      buyer.total += order.total
      buyers.set(order.customer.id, buyer)
    }
    return {
      statuses,
      months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      buyers: [...buyers.values()].sort((a, b) => b.total - a.total).slice(0, 5),
    }
  },
})

export const getOrder = query('getOrder', {
  about: 'One order with its customer, for staff or for its owner',
  input: { id: link('orders') },
  access: 'signedIn',
  system: 'staff see every order, and a customer is held to their own here',
  run: ({ input, db, user }) => {
    const order = db.system.orders.where({ id: input.id }).with('customer').first()
    if (!order || !user) return undefined
    return user.roles.includes('staff') || order.placedBy === user.id ? order : undefined
  },
})

export const addOrder = change('addOrder', {
  about: 'Adds an order, which belongs to the user of its customer, or to the staff member who adds it',
  input: {
    customer: link('customers'),
    total: number({ min: 0, whole: true }),
    note: text({ optional: true, max: 2000 }),
  },
  access: role('staff'),
  system: 'staff add an order for any customer',
  output: object({ id: link('orders'), placedBy: link('users') }),
  run: ({ input, db, user }) => {
    const customer = db.system.customers.get(input.customer)
    if (!customer || !user) fail('not-found', 'That customer is not there.')
    return db.system.orders.add({
      customer: input.customer,
      placedBy: customer.user ?? user.id,
      total: input.total,
      note: input.note,
    })
  },
})

export const markPaid = change('markPaid', {
  about: 'Marks an open order as paid',
  input: { order: link('orders') },
  access: role('staff'),
  system: 'staff mark any order paid',
  run: ({ input, db }) => {
    const order = db.system.orders.get(input.order)
    if (!order) fail('not-found', 'That order is not there.')
    if (order.status !== 'open') fail('not-open', 'Only an open order can be marked paid.')
    db.system.orders.change(input.order, { status: 'paid' })
  },
})

export const attachReceipt = change('attachReceipt', {
  about: 'Attaches a receipt, a PDF, to an order of the caller',
  input: { order: link('orders'), receipt: file({ kinds: ['application/pdf'], maxSize: '10 MB' }) },
  access: 'signedIn',
  set: orders.change(input('order'), { receipt: input('receipt') }),
})
