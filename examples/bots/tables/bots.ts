import { choice, link, list, table, text } from 'tentjs'
import { botColours, botShapes } from '../lib/looks'

// The chief is a row too, so the sidebar draws it as the first tile and its talk stands at /bots/:id.
export const bots = table('bots', {
  columns: {
    name: text({ min: 1, max: 60 }),
    brief: text({ max: 4000, lines: 'many', default: '' }),
    model: choice(['thinker', 'quick'], { default: 'thinker' }),
    kind: choice(['bot', 'chief'], { default: 'bot' }),
    shape: choice([...botShapes], { default: 'round' }),
    colour: choice([...botColours], { default: 'orange' }),
    apps: list(text(), { default: [] }),
    folder: text({ optional: true }),
    owner: link('users'),
  },
  owner: 'owner',
  access: { read: 'owner', add: 'owner', change: 'owner', remove: 'owner' },
})
