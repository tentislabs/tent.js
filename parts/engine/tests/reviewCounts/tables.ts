import { list, project, table, text } from 'tentjs'

export const shop = project('shop', {
  countBy: 'caller',
  limits: { anyonePerMinute: 1000000, callerPerMinute: 1000000 },
})

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// Each person reads the rows of their own use.
export const usage = table('usage', { shows: 'counts', access: { read: 'owner' } })

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'anyone', add: 'anyone' },
})
