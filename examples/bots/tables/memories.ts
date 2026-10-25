import { choice, json, link, table, text } from 'tentjs'

// The talk of each bot. Claude Code keeps the bot's own memory in its session; these rows are what the screen draws.
export const memories = table('memories', {
  columns: {
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ optional: true, lines: 'many' }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    bot: link('bots', { onRemove: 'remove' }),
    by: link('users', { optional: true }),
  },
  owner: 'by',
  access: { read: 'owner' },
})
