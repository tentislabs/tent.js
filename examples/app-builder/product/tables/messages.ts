import { choice, json, link, table, text } from 'tentjs'

// The memory of the assistant that builds: one conversation for each project.
export const messages = table('messages', {
  columns: {
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ optional: true, lines: 'many' }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    project: link('projects', { onRemove: 'remove' }),
    owner: link('users', { optional: true }),
  },
  owner: 'owner',
  access: { read: 'owner' },
})
