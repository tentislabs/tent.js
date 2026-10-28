import { agent, link, model, secret, table, text } from 'tentjs'
import { openNow } from './functions'

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

// The notes of each team stand in the file of that team.
export const teamNotes = table('teamNotes', {
  columns: { team: link('teams', { onRemove: 'remove' }), words: text() },
  tenant: 'team',
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// An agent that a signed-in caller starts through the door.
export const helper = agent('helper', {
  model: writer,
  instructions: 'You help with notes.',
  tools: [openNow],
  access: 'signedIn',
})
