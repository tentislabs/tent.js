import { boolean, choice, date, day, link, list, number, role, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

// A member is written by the staff alone, and who wrote it is kept.
export const members = table('members', {
  columns: {
    name: text({ min: 1, unique: true }),
    born: day(),
    height: number(),
    joined: date(),
    team: choice(['red', 'blue'], { messages: 'teams' }),
    active: boolean({ default: true }),
    by: link('users', { optional: true, onRemove: 'clear' }),
  },
  access: { read: 'signedIn', add: role('staff') },
})

// A visit holds no unique value: a record written twice stands twice.
export const visits = table('visits', {
  columns: { name: text(), height: number() },
  access: { read: 'signedIn', add: role('staff') },
})
