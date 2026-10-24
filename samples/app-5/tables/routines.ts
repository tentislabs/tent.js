import { boolean, date, link, table, text } from 'tentjs'

export const routines = table('routines', {
  columns: {
    bot: link('bots', { onRemove: 'remove' }),
    every: text({ optional: true, max: 200 }),
    on: text({ optional: true, max: 200 }),
    task: text({ min: 1, max: 4000, lines: 'many' }),
    next: date({ optional: true }),
    paused: boolean({ default: false }),
    owner: link('users'),
  },
  owner: 'owner',
  access: { read: 'owner', add: 'owner', change: 'owner', remove: 'owner' },
})
