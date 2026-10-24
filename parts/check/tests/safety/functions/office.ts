import {
  action,
  anyone,
  change,
  count,
  fail,
  input,
  link,
  list,
  log,
  number,
  object,
  query,
  role,
  roles,
  sum,
  text,
} from 'tentjs'
import { audit, guestbook, orders, speakers, teams, users } from '../tables/office'

// T2005: a link of an input to a table that is not there.
export const byProject = query('byProject', {
  access: 'signedIn',
  input: { project: link('projects') },
  rows: teams.limit(5),
})

// T3002: bare 'anyone' on a change and on an action.
export const sign = change('sign', {
  access: 'anyone',
  input: { line: text() },
  set: guestbook.add({ line: input('line') }),
})

export const ping = action('ping', {
  access: 'anyone',
  run: async () => {
    log.info('pinged')
  },
})

// Bare 'anyone' on a query that reads no personal data is taken.
export const guests = query('guests', { access: 'anyone', rows: guestbook.limit(20) })

export const names = query('names', { access: 'anyone', rows: speakers.pick(['id', 'name']).limit(20) })

// T3003: bare 'anyone' on a query that reads personal data.
export const phoneBook = query('phoneBook', { access: 'anyone', rows: speakers.limit(20) })

export const phones = query('phones', { access: 'anyone', rows: speakers.pick(['id', 'phone']).limit(20) })

export const bodyPhones = query('bodyPhones', {
  access: 'anyone',
  run: ({ db }) => db.speakers.limit(5).all(),
})

// T3004: full access used by a function that states no `system`.
export const peek = query('peek', {
  access: role('staff'),
  run: ({ db }) => db.system.orders.limit(5).all(),
})

export const peekWhy = query('peekWhy', {
  access: role('staff'),
  system: 'the staff see every order, not only their own',
  run: ({ db }) => db.system.orders.limit(5).all(),
})

const harmless = (): number => 1

export const raw = action('raw', {
  access: role('staff'),
  run: async ({ db }) => {
    harmless()
    await db.sql('SELECT 1')
  },
})

export const promote = change('promote', {
  access: role('admin'),
  input: { user: link('users') },
  run: ({ input }) => {
    roles.add(input.user, 'staff')
  },
})

export const addLine = change('addLine', {
  access: role('staff'),
  system: 'nobody reads the audit, and the staff write it',
  input: { line: text() },
  set: audit.add({ line: input('line') }),
})

// T3006: a private column in `pick`, in a `group`, in a value that a group works out, and in an output.
export const pay = query('pay', { access: role('hr'), rows: users.pick(['id', 'salary']).limit(20) })

export const payGroups = query('payGroups', { access: role('hr'), rows: users.group('salary', { n: count() }) })

export const payroll = query('payroll', { access: role('hr'), rows: users.group('name', { total: sum('salary') }) })

export const payOut = query('payOut', {
  access: role('hr'),
  rows: users.limit(5),
  output: list(object({ id: text(), salary: number() })),
})

export const paidBy = query('paidBy', {
  access: role('hr'),
  rows: orders.pick(['id', 'placedBy.salary']).limit(20),
})

export const staffNames = query('staffNames', { access: role('hr'), rows: users.pick(['id', 'name']).limit(20) })

// T3009: a function that any signed-in caller may call, that states `system` and writes a table whose rule is 'owner'.
export const markPaid = change('markPaid', {
  access: 'signedIn',
  system: 'an order is marked paid when its payment arrives',
  input: { order: link('orders') },
  set: orders.change(input('order'), { paid: true }),
})

export const dropOrder = change('dropOrder', {
  access: anyone('an order is taken back by a link in a mail'),
  system: 'the link names the order',
  input: { order: link('orders') },
  set: orders.remove(input('order')),
})

export const payAny = change('payAny', {
  access: 'signedIn',
  system: 'an order is marked paid when its payment arrives',
  input: { order: link('orders') },
  run: ({ db, input }) => {
    db.system.orders.change(input.order, { paid: true })
  },
})

// The staff alone may call it, so the rule of the function is the check.
export const reopen = change('reopen', {
  access: role('staff'),
  system: 'the staff reopen any order, not only their own',
  input: { order: link('orders') },
  set: orders.change(input('order'), { paid: false }),
})

// It holds the order to its owner before it writes.
export const payMine = change('payMine', {
  access: 'signedIn',
  system: 'the row is read with full access, and held to its owner',
  input: { order: link('orders') },
  run: ({ db, input, user }) => {
    const order = db.system.orders.get(input.order)
    if (order?.placedBy !== user?.id) fail('not-yours', 'That order is not yours.')
    db.system.orders.change(input.order, { paid: true })
  },
})

// It writes through `db`, so the rule of the table holds.
export const payOwn = change('payOwn', {
  access: 'signedIn',
  system: 'it reads the prices with full access',
  input: { order: link('orders') },
  run: ({ db, input }) => {
    db.orders.change(input.order, { paid: true })
  },
})
