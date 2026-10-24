import { list, number, role, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'signedIn' },
})

// The salary is read by hr alone: a model that works for anyone else is never handed it, nor what it would tell.
export const staff = table('staff', {
  columns: { name: text(), salary: number({ read: role('hr') }) },
  access: { read: 'signedIn' },
})
