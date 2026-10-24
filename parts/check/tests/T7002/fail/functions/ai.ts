import { action, agent, file, files, mail, model, query, secret, table, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const notes = table('notes', { columns: { words: text() }, access: { read: 'signedIn' } })

export const allNotes = query('allNotes', { about: 'The notes', access: 'signedIn', input: {}, rows: notes.where({}).limit(20) })

export const fetchNews = action('fetchNews', { about: 'Reads a file', access: 'signedIn', input: { paper: file() }, output: text(), sends: false, run: async ({ input }) => files.text(input.paper) })

export const mailOut = action('mailOut', { about: 'Mails the words', access: 'signedIn', input: { words: text() }, output: text(), run: async ({ input }) => { await mail.send({ from: 'a@example.com', to: 'b@example.com', subject: 'Words', text: input.words }); return 'sent' } })

export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [allNotes, fetchNews, mailOut], trust: [mailOut], limits: { steps: 12, perRun: { tokensOut: 50000 } } })
