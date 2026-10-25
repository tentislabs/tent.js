import { choice, json, link, list, number, table, text } from 'tentjs'

// What a run waits for the person on: a permission Claude Code asked for, or a question with lettered choices.
export const asks = table('asks', {
  columns: {
    bot: link('bots', { onRemove: 'remove' }),
    run: text(),
    step: text(),
    repeat: number({ whole: true, default: 1 }),
    kind: choice(['permission', 'question']),
    tool: text({ default: '' }),
    input: json({ optional: true }),
    question: text({ optional: true, lines: 'many' }),
    choices: list(text(), { default: [] }),
    state: choice(['waiting', 'yes', 'no'], { default: 'waiting' }),
    answer: text({ optional: true }),
    owner: link('users'),
  },
  owner: 'owner',
  access: { read: 'owner' },
})
