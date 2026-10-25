import { choice, date, json, link, table, text } from 'tentjs'

// One row for each run of a bot, whoever started it, so the list of runs holds the routine's runs too.
export const turns = table('turns', {
  columns: {
    bot: link('bots', { onRemove: 'remove' }),
    run: text(),
    by: choice(['person', 'routine', 'chief']),
    task: text({ lines: 'many', default: '' }),
    state: choice(['running', 'waiting', 'done', 'failed', 'stopped'], { default: 'running' }),
    answer: text({ optional: true, lines: 'many' }),
    error: json({ optional: true }),
    under: text({ optional: true }),
    used: json({ optional: true }),
    ended: date({ optional: true }),
    owner: link('users'),
  },
  owner: 'owner',
  access: { read: 'owner' },
})
