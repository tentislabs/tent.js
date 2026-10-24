import { allow, agent, model, query } from 'tentjs'
import { notes } from '../tables/orders'

export const writer = model('writer', { provider: 'openai', name: 'gpt-5' })

export const countNotes = query('countNotes', { access: 'signedIn', rows: notes.count() })

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help with notes.',
  tools: [countNotes],
  limits: { steps: 12, perRun: { tokensOut: 50000 } },
  access: allow((user) => {
    let id = user?.id
    return id === 'u1'
  }),
})
