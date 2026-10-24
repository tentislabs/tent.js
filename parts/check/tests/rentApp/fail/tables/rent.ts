import { choice, day, link, list, number, table, text } from 'tentjs'

// The tables of the rent app: the homes a landlord lets, and the rent of one home for one month.
export const users = table('users', {
  columns: { email: text({ unique: true }), name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const homes = table('homes', {
  columns: {
    name: text({ min: 1, max: 120 }),
    landlord: link('users', { onRemove: 'remove' }),
    renter: link('users', { optional: true, onRemove: 'clear' }),
    rent: number({ min: 0, whole: true }),
  },
  owner: 'landlord',
  access: { read: 'owner' },
})

export const rents = table('rents', {
  columns: {
    home: link('homes', { onRemove: 'remove' }),
    renter: link('users', { onRemove: 'remove' }),
    month: text(),
    amount: number({ min: 0, whole: true }),
    status: choice(['due', 'told', 'paid'], { default: 'due' }),
    toldNote: text({ max: 200, optional: true }),
    paidOn: day({ optional: true }),
  },
  owner: 'renter',
  access: { read: 'owner' },
})
