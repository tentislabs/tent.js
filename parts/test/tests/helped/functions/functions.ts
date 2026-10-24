import { action, agent, boolean, change, input, json, model, query, secret, text, undo } from 'tentjs'
import { chats, messages, notes, staff } from '../tables/tables'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const allStaff = query('allStaff', {
  about: 'Every person of the staff.',
  access: 'signedIn',
  input: {},
  rows: staff.oldest('createdAt').limit(100),
})

export const addNote = change('addNote', {
  about: 'Adds a note.',
  access: 'signedIn',
  input: { title: text() },
  set: notes.add({ title: input('title') }),
})

export const newChat = change('newChat', { access: 'signedIn', input: {}, set: chats.add({ title: 'A chat' }) })

export const allMessages = query('allMessages', { access: 'signedIn', input: {}, rows: messages.where({}) })

export const undoRun = action('undoRun', {
  access: 'nobody',
  system: 'undo writes what the run wrote, whoever wrote it',
  input: { run: text(), dry: boolean({ optional: true }) },
  output: json(),
  run: async ({ input: given }) => undo.run(given.run, { ...(given.dry === undefined ? {} : { dry: given.dry }) }),
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [allStaff, addNote],
  trust: [addNote],
  memory: { in: messages, thread: 'chat' },
  access: 'signedIn',
  limits: { steps: 6, perRun: { calls: 100 } },
})
