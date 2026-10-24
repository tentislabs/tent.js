import { agent, model, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { words: text() }, access: { read: 'signedIn' } })

export const allNotes = query('allNotes', { about: 'The notes', access: 'signedIn', input: {}, rows: notes.where({}).limit(20) })

export const reader = model('reader', { provider: 'openai-style', name: 'tiny', url: 'http://127.0.0.1:1/v1', abilities: ['reply'], takes: 4000 })

export const helper = agent('helper', { model: reader, instructions: 'You help.', tools: [allNotes], limits: { steps: 12, perRun: { tokensOut: 50000 } } })
