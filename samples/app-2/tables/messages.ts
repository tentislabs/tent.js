import { anyone, role, table, text } from 'tentjs'

export const messages = table('messages', {
  columns: {
    email: text({ min: 3, max: 254, pattern: '^[^@\\s]+@[^@\\s]+$' }),
    text: text({ lines: 'many', min: 1, max: 5000 }),
  },
  access: {
    add: anyone('a visitor writes to the shop through the contact form'),
    read: role('staff'),
  },
})
