import { list, number, query, role, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()), salary: number({ private: true, optional: true }) },
  access: { read: 'signedIn' },
})

export const staff = query('staff', { access: role('hr'), rows: users.pick(['id', 'name']).limit(20) })
