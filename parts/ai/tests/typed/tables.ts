import { choice, json, link, list, number, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { title: text(), total: number(), placedBy: link('users', { optional: true }) },
  owner: 'placedBy',
  // Only the shop adds orders, so what a read of them answers is no text from outside.
  access: { read: 'owner', add: 'nobody' },
})

// What the shop keeps of each customer: an address that is personal, and a note that never leaves the server.
export const customers = table('customers', {
  columns: {
    name: text(),
    email: text({ personal: true }),
    note: text({ private: true, optional: true }),
    keptBy: link('users', { optional: true }),
  },
  owner: 'keptBy',
  access: { read: 'owner', add: 'nobody' },
})

export const chats = table('chats', {
  columns: { title: text({ optional: true }), by: link('users', { optional: true }) },
  owner: 'by',
  access: { read: 'owner', add: 'signedIn' },
})

export const messages = table('messages', {
  columns: {
    chat: link('chats'),
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ lines: 'many', optional: true }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    by: link('users', { optional: true }),
  },
  owner: 'by',
  access: { read: 'owner' },
})
