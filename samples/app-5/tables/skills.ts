import { link, table, text } from 'tentjs'

// A skill is Claude Code's own skill file in the bot's folder; the row is its copy that the screens list and edit.
export const skills = table('skills', {
  columns: {
    bot: link('bots', { onRemove: 'remove' }),
    name: text({ min: 1, max: 64, pattern: '^[a-z0-9][a-z0-9-]*$' }),
    about: text({ max: 1024, default: '' }),
    body: text({ lines: 'many', default: '' }),
    owner: link('users'),
  },
  owner: 'owner',
  access: { read: 'owner', add: 'owner', change: 'owner', remove: 'owner' },
})
