import { boolean, caller, calc, choice, col, date, day, file, json, link, list, number, object, role, table, text, where, message } from 'tentjs'

export const users = table('users', {
  columns: { email: text({ unique: true, personal: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const teams = table('teams', {
  columns: { name: text({ min: 1, max: 80 }) },
  access: { read: 'signedIn' },
})

export const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users'), admin: boolean() },
  access: { read: where({ user: caller('id') }) },
})

export const customers = table('customers', {
  columns: {
    name: text({ label: message('customers.name'), help: 'As it stands on the invoice' }),
    email: text({ pattern: '^[^@]+@[^@]+$', private: true }),
    tier: choice(['standard', 'gold'], { default: 'standard', messages: 'customers.tier' }),
    team: link('teams'),
    born: day({ optional: true }),
    tags: list(text({ max: 20 }), { max: 10 }),
    address: object({ street: text(), city: text({ optional: true }) }, { optional: true }),
    more: json({ optional: true }),
  },
  access: {
    read: where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } }),
    add: role('staff'),
    change: role('staff'),
  },
  search: ['name'],
  was: ['clients', 'buyers'],
})

export const orders = table('orders', {
  columns: {
    customer: link('customers'),
    placedBy: link('users', { default: caller('id') }),
    net: number({ min: 0, whole: true }),
    vat: number({ min: 0, max: 100, default: 20 }),
    gross: number({ optional: true, from: calc('+', col('net'), calc('/', calc('*', col('net'), col('vat')), 100)) }),
    note: text({ optional: true, lines: 'many', was: 'remark' }),
    status: choice(['open', 'paid', 'shipped'], { default: 'open', index: true }),
    placedAt: date({ default: 'now' }),
    due: day({ default: 'today' }),
    receipt: file({ optional: true, maxSize: '10 MB', kinds: ['application/pdf'] }),
  },
  owner: 'placedBy',
  access: {
    read: where((user, db) => ({ customer: { in: db.customers.where({ team: user?.team }).pick(['id']) } })),
    add: 'signedIn',
    change: 'owner',
  },
  indexes: [['status', 'placedAt']],
  unique: [['customer', 'placedAt']],
  keepHistory: true,
  removed: ['oldTotal'],
})
