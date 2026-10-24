import { link, list, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

// A row of memory links to a row that stays.
export const presence = table('presence', {
  kept: 'memory',
  lasts: '30 seconds',
  columns: { user: link('users', { onRemove: 'remove' }), doc: text() },
  access: { read: 'signedIn' },
})
