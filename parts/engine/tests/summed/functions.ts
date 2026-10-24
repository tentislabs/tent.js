import { agent, change, input, list, model, query, text } from 'tentjs'
import { chats, messages, users } from './tables.ts'

export const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const newChat = change('newChat', { access: 'signedIn', input: {}, set: chats.add({ title: 'A chat' }) })

export const allMessages = query('allMessages', { access: 'nobody', input: {}, rows: messages.where({}) })

// An agent that shortens all but the latest turn once two more came after its summary.
export const agentOfChats = agent('agentOfChats', {
  model: writer,
  instructions: 'You help.',
  tools: [],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat', keep: 1, after: 1, shrink: 'summary' },
  limits: { steps: 4, perRun: { calls: 100 } },
})
