import { choice, json, link, role, table, text } from 'tentjs'

// The memory of the assistant: only the engine writes it, so it states no add and no change rule.
export const messages = table('messages', {
  columns: {
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ optional: true, lines: 'many' }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    ticket: link('tickets'),
    by: link('users', { optional: true }),
  },
  owner: 'by',
  access: { read: role('staff') },
})
