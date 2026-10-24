import { boolean, choice, number, table, text } from 'tentjs'

const NOTE_LENGTH = 200

// Orders, as the shop takes them.
export const orders = table('orders', {
  columns: {
    title: text({ min: 1, max: 80 }),
    total: number({ min: 0 }),
    paid: boolean({ default: false }),
    state: choice(['open', 'sent', 'done']),
    note: text({ optional: true, max: NOTE_LENGTH }),
  },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'nobody' },
})

export const clients = table('clients', {
  columns: {
    name: text(),
    city: text({ optional: true }),
  },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'nobody' },
})
