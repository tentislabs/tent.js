import { date, link, list, number, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })

export const members = table('members', {
  columns: { team: link('teams'), user: link('users') },
  access: { read: 'signedIn' },
})

export const items = table('items', {
  columns: {
    title: text(),
    n: number(),
    team: link('teams', { optional: true }),
    at: date({ optional: true }),
  },
  access: { read: 'signedIn', add: 'signedIn' },
})
