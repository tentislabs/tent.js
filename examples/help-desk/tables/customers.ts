import { choice, link, role, table, text } from 'tentjs'

export const customers = table('customers', {
  columns: {
    name: text({ min: 1, max: 200, personal: true }),
    email: text({ unique: true, personal: true }),
    tier: choice(['standard', 'gold'], { default: 'standard' }),
    user: link('users', { optional: true }),
  },
  access: { read: role('staff'), add: role('staff'), change: role('staff') },
})
