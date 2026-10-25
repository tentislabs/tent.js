import { link, table, text } from 'tentjs'

export const projects = table('projects', {
  columns: {
    owner: link('users'),
    workspace: text(),
    name: text({ min: 1, max: 80 }),
    address: text(),
    live: text({ optional: true }),
  },
  owner: 'owner',
  access: { read: 'owner', add: 'owner', change: 'owner', remove: 'owner' },
})
