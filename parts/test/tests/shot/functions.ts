import { list, number, query, table, text } from 'tentjs'

// The users of the app: a picture as a user is taken through a pass, which names one.
export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const tiles = table('tiles', {
  columns: { color: text(), place: number() },
  access: { read: 'anyone' },
})

export const allTiles = query('allTiles', { access: 'anyone', rows: tiles.oldest('place') })
