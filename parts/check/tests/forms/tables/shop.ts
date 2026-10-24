import { choice, date, file, link, list, number, role, table, text, where } from 'tentjs'

export const orders = table('orders', {
  columns: {
    customer: link('customers'),
    placedBy: link('users'),
    total: number({ min: 0 }),
    chargeId: text({ optional: true }),
    note: text({ optional: true, lines: 'many' }),
    status: choice(['open', 'paid', 'shipped'], { default: 'open' }),
    placedAt: date({ default: 'now' }),
    receipt: file({ optional: true, kinds: ['application/pdf'] }),
  },
  owner: 'placedBy',                 // the column that says whose row it is; it must link to users
  access: { read: 'owner', add: 'signedIn', change: 'owner', remove: 'nobody' },
  search: ['note'],
  indexes: [['status', 'placedAt']],
  unique: [],
  keepHistory: false,                // keep old versions of rows
  removed: [],                       // columns removed on purpose
  was: undefined,                    // one old name, or a list of them
})

export const users = table('users', {
  columns: { email: text({ unique: true, personal: true }), roles: list(text()) },
  access: { read: 'owner' },        // on users, 'owner' means the caller's own row
})

export const customers = table('customers', {
  columns: { name: text(), email: text(), tier: choice(['standard', 'gold'], { default: 'standard' }) },
  access: {
    read: where((user) => {
      let name = user?.id
      return { name }
    }),
    add: role('staff'),
    change: role('staff'),
  },
})
