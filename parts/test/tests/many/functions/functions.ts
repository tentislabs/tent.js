import { action, anyone, change, input, number, query, role, sessions, text } from 'tentjs'
import { customers, notes, orders, teams } from '../tables/tables'

const open = anyone('a test calls it from every machine')

export const addOrder = change('addOrder', {
  access: open,
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

export const listOrders = query('listOrders', { access: open, rows: orders.oldest('createdAt').limit(1000) })

// A query in code: nothing is known of what it reads.
export const countOrders = query('countOrders', {
  access: open,
  output: number(),
  run: ({ db }) => {
    const all = db.orders.all()
    return all.length
  },
})

export const listCustomers = query('listCustomers', { access: open, rows: customers.limit(100) })

export const addCustomer = change('addCustomer', {
  access: open,
  input: { name: text() },
  set: customers.add({ name: input('name') }),
})

export const listNotes = query('listNotes', { access: open, rows: notes.limit(100) })

export const openTeam = change('openTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

// A change whose answer waits for every reader, the far ones too.
export const shout = change('shout', {
  access: open,
  input: { title: text() },
  everywhere: true,
  set: orders.add({ title: input('title') }),
})

export const giveRole = change('giveRole', {
  access: open,
  input: { user: text() },
  system: 'a test gives a role as the office would',
  run: ({ db, input: given }) => {
    db.system.users.change(given.user, { roles: ['staff'] })
  },
})

// A raw SQL write that states nothing of what it touches.
export const rawWrite = change('rawWrite', {
  access: open,
  system: 'a test writes with raw SQL',
  run: ({ db }) => {
    db.sql('UPDATE "orders" SET "paid" = "paid"')
  },
})

// A raw SQL write that states the one table it touches.
export const statedWrite = change('statedWrite', {
  access: open,
  system: 'a test writes with raw SQL',
  touches: ['orders'],
  run: ({ db }) => {
    db.sql('UPDATE "orders" SET "paid" = "paid"')
  },
})

// An action that says it changes nothing, and that a reader so answers itself.
export const peek = action('peek', {
  access: open,
  changes: false,
  output: number(),
  run: async ({ db }) => db.orders.count(),
})

// An action that says it changes nothing and then meets what only the writer does.
export const sneak = action('sneak', {
  access: open,
  changes: false,
  input: { title: text() },
  output: text(),
  run: async ({ input: given }) => {
    await addOrder({ title: given.title })
    return 'done'
  },
})

// Signs a user in by their id, as a starter would once it proved who they are.
export const signIn = action('signIn', {
  access: open,
  system: 'a test signs a user in',
  input: { user: text() },
  run: async ({ input: given }) => {
    sessions.start(given.user)
  },
})

// What the staff alone may read, of another table than the one that holds the roles.
export const staffCustomers = query('staffCustomers', { access: role('staff'), rows: customers.limit(100) })

// Who the caller is, as the session of the request names them.
export const whoAmI = query('whoAmI', { access: open, output: text(), run: ({ user }) => user?.id ?? 'no user' })

// Ends the session of the request.
export const signOut = action('signOut', {
  access: open,
  run: async () => {
    sessions.end()
  },
})
