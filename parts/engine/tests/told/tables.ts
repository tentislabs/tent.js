import { choice, json, link, list, number, project, table, text } from 'tentjs'

export const told = project('told', { limits: { anyonePerMinute: 100000, callerPerMinute: 100000 } })

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { status: choice(['open', 'paid']), total: number() },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
})

export const refunds = table('refunds', {
  columns: { order: link('orders'), amount: number() },
  access: { read: 'signedIn', add: 'signedIn' },
})

// The memory of the agents that keep a conversation.
export const chats = table('chats', {
  columns: { title: text({ optional: true }) },
  access: { read: 'anyone', add: 'anyone' },
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
