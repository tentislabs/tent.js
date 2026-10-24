import { choice, day, json, link, list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { title: text(), placedBy: link('users', { optional: true }) },
  owner: 'placedBy',
  access: { read: 'owner', add: 'nobody' },
})

// A birthday is personal and no text: the guard holds every personal value, not only one that is text.
export const customers = table('customers', {
  columns: {
    name: text(),
    born: day({ personal: true }),
    keptBy: link('users', { optional: true }),
  },
  owner: 'keptBy',
  access: { read: 'owner', add: 'nobody' },
})

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: 'signedIn', add: 'nobody' },
})

// The notes of each team stand in the file of that team, and each is read by whoever wrote it.
export const notes = table('notes', {
  columns: {
    team: link('teams', { onRemove: 'remove' }),
    words: text(),
    by: link('users', { optional: true }),
  },
  tenant: 'team',
  owner: 'by',
  access: { read: 'owner', add: 'nobody' },
})

// The ratings and the scores of the runs, as the engine keeps them: each person reads those of their own runs.
export const ratings = table('ratings', { shows: 'scores', access: { read: 'owner' } })

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
