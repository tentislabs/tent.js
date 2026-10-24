import { choice, json, link, list, table, text } from 'tentjs'

export const users = table('users', {
  columns: { email: text(), roles: list(text()) },
  access: { read: 'owner' },
})

export const projects = table('projects', {
  columns: { owner: link('users'), workspace: text(), name: text({ optional: true }) },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn' },
})

export const messages = table('messages', {
  columns: {
    project: link('projects'),
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ lines: 'many', optional: true }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    by: link('users', { optional: true }),
  },
  owner: 'by',
  access: { read: 'owner' },
})
