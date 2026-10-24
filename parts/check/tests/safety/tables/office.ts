import { anyone, boolean, link, list, number, table, text } from 'tentjs'

// On `users` the rule 'owner' means the caller's own row, and the table states no `owner`.
export const users = table('users', {
  columns: {
    name: text(),
    email: text({ personal: true }),
    roles: list(text()),
    salary: number({ private: true, optional: true }),
  },
  access: { read: 'owner' },
})

export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })

export const orders = table('orders', {
  columns: { title: text(), placedBy: link('users'), team: link('teams'), paid: boolean({ default: false }) },
  owner: 'placedBy',
  access: { read: 'owner', add: 'signedIn', change: 'owner', remove: 'owner' },
})

// T2005: a link to a table that is not there.
export const tasks = table('tasks', {
  columns: { title: text(), project: link('projects') },
  access: { read: 'signedIn' },
})

// T2006: a search column that is a number, in the form that states how it is searched.
export const stock = table('stock', {
  columns: { name: text(), count: number() },
  search: { columns: ['name', 'count'], by: 'pieces' },
  access: { read: 'signedIn' },
})

// T2007: an owner column that links another table than `users`.
export const desks = table('desks', {
  columns: { name: text(), team: link('teams') },
  owner: 'team',
  access: { read: 'signedIn' },
})

// T2007: the rule 'owner' on a table that states no owner.
export const papers = table('papers', { columns: { name: text() }, access: { read: 'owner' } })

// T3002: bare 'anyone' on a write. On the read of a table with no personal column it is taken, and so is a reason.
export const guestbook = table('guestbook', {
  columns: { line: text() },
  access: { read: 'anyone', add: 'anyone', remove: anyone('a visitor takes their line back') },
})

// T3003: bare 'anyone' on the read of a table with a personal column.
export const people = table('people', {
  columns: { name: text(), phone: text({ personal: true }) },
  access: { read: 'anyone' },
})

export const speakers = table('speakers', {
  columns: { name: text(), phone: text({ personal: true }) },
  access: { read: anyone('the speakers of the conference are public') },
})

// T3005: a table that no rule lets anyone read, and that nothing uses.
export const forgotten = table('forgotten', { columns: { line: text() }, access: {} })

// Nobody reads it either, and a change writes it.
export const audit = table('audit', { columns: { line: text() }, access: {} })
