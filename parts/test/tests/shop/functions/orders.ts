import { anyone, change, date, input, number, query, role, text } from 'tentjs'
import { orders } from '../tables/orders'

export const openOrders = query('openOrders', {
  access: 'signedIn',
  input: { limit: number() },
  rows: orders.where({ paid: false }).oldest('createdAt').limit(input('limit')),
})

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text({ min: 1 }) },
  set: orders.add({ title: input('title') }),
})

export const markPaid = change('markPaid', {
  access: role('staff'),
  input: { order: text() },
  set: orders.change(input('order'), { paid: true }),
})

export const dropOrder = change('dropOrder', {
  access: role('staff'),
  input: { order: text() },
  set: orders.remove(input('order')),
})

export const whoAmI = query('whoAmI', {
  access: anyone('it tells a caller only who they are'),
  output: text(),
  run: ({ user }) => user?.id ?? 'no user',
})

export const staffOnly = query('staffOnly', {
  access: role('staff'),
  output: text(),
  run: ({ user }) => user?.id ?? 'no user',
})

export const yearOf = query('yearOf', {
  access: anyone('it answers the year of a moment that it is handed'),
  input: { at: date() },
  output: number(),
  run: ({ input: given }) => (given.at instanceof Date ? given.at.getUTCFullYear() : -1),
})

export const moment = query('moment', {
  access: anyone('the time is no secret'),
  output: date(),
  run: ({ now }) => now,
})
