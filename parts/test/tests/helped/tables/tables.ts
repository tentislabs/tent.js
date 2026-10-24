import { choice, json, link, list, number, role, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'signedIn' },
})

// The salary is read by hr alone, on every path, a model's among them.
export const staff = table('staff', {
  columns: { name: text(), salary: number({ read: role('hr') }) },
  access: { read: 'signedIn' },
})

export const notes = table('notes', {
  columns: { title: text() },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const chats = table('chats', {
  columns: { title: text({ optional: true }), by: link('users', { optional: true }) },
  owner: 'by',
  access: { read: 'owner', add: 'signedIn' },
})

// What an agent keeps of a conversation is a row of the builder's own, kept for a time as any row.
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
  lasts: { for: '30 days', by: 'createdAt' },
  access: { read: 'owner' },
})
