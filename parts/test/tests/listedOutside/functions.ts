import { agent, list, model, secret, table, text } from 'tentjs'
import { board } from './services'

export const users = table('users', { columns: { name: text(), roles: list(text()) } })

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// The tools of the board told as a list, and called by name with `call`.
export const lister = agent('lister', {
  about: 'Works with the board, told as a list',
  model: writer,
  instructions: 'Use the board.',
  tools: [board],
  trust: [board],
  tell: 'list',
  access: 'signedIn',
  limits: { steps: 6, perRun: { tokensOut: 20000 } },
})

// The tools of the board called from a sequence, by their dotted names.
export const sequencer = agent('sequencer', {
  about: 'Works with the board in sequences',
  model: writer,
  instructions: 'Use the board.',
  tools: [board],
  trust: [board],
  sequence: true,
  access: 'signedIn',
  limits: { steps: 6, perRun: { tokensOut: 20000 } },
})

// The same, trusting nothing, and offered to a chat app: a sequence of it asks the person once for its calls.
export const planner = agent('planner', {
  about: 'Plans cards on the board',
  model: writer,
  instructions: 'Use the board.',
  tools: [board],
  sequence: true,
  access: 'signedIn',
  offer: ['mcp'],
  limits: { steps: 6, perRun: { tokensOut: 20000 } },
})
