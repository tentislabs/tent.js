import { choice, link, table, text } from 'tentjs'

// An app is an MCP server that Claude Code starts by its command or reaches at its address.
export const apps = table('apps', {
  columns: {
    name: text({ min: 1, max: 60 }),
    about: text({ max: 300, default: '' }),
    icon: choice(['files', 'browser', 'calendar', 'mail', 'other'], { default: 'other' }),
    command: text({ optional: true, max: 1000 }),
    address: text({ optional: true, max: 1000 }),
    owner: link('users'),
  },
  owner: 'owner',
  access: { read: 'owner', add: 'owner', change: 'owner', remove: 'owner' },
})
