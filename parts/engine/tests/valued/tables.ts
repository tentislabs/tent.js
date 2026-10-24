import { boolean, list, number, project, table, text } from 'tentjs'

export const valued = project('valued', {
  settings: {
    shopName: { type: text({ default: 'The shop' }), public: true },
    maxItems: { type: number({ default: 5, min: 1 }) },
    open: { type: boolean({ default: true }), public: true },
    owner: { type: text({ optional: true }) },
    tags: { type: list(text(), { default: [] }) },
  },
})

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// What a person keeps for themselves: stored encrypted, each value by itself.
export const vault = table('vault', {
  columns: { title: text(), note: text({ sealed: true }), pin: number({ sealed: true, optional: true }) },
  access: { read: 'anyone', add: 'anyone', change: 'anyone' },
})
