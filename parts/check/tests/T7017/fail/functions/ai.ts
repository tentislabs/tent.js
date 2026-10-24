import { action, agent, change, model, secret, table, text } from 'tentjs'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const notes = table('notes', { columns: { words: text() }, access: { read: 'signedIn' } })

export const wipe = change('wipe', { access: 'signedIn', input: {}, danger: 'ask', set: notes.add({ words: 'wiped' }) })

export const tidyUp = action('tidyUp', { about: 'Tidies up', access: 'signedIn', input: {}, output: text(), run: async () => { await wipe({}); return 'tidy' } })

export const helper = agent('helper', { model: writer, instructions: 'You help.', tools: [tidyUp], trust: [tidyUp], limits: { steps: 12, perRun: { tokensOut: 50000 } } })
