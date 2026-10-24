import { choice, json, link, list, number, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// A conversation that only the person who opened it may read.
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

// Rows whose text a stranger wrote: what a tool reads of them may steer a model.
export const notes = table('notes', {
  columns: { words: text({ lines: 'many' }) },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const invites = table('invites', {
  columns: { email: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const orders = table('orders', {
  columns: { item: text(), total: number() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const refunds = table('refunds', {
  columns: { order: link('orders') },
  access: { read: 'signedIn', add: 'signedIn' },
})
