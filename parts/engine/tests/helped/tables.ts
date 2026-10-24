import { choice, json, link, list, number, project, table, text } from 'tentjs'

export const helped = project('helped', { limits: { anyonePerMinute: 100000, callerPerMinute: 100000 } })

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// A conversation that every signed-in person may open.
export const chats = table('chats', {
  columns: { title: text({ optional: true }) },
  access: { read: 'signedIn', add: 'anyone' },
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

export const orders = table('orders', {
  columns: { item: text(), total: number() },
  access: { read: 'anyone', add: 'anyone' },
})
