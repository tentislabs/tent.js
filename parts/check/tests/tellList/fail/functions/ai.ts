import { agent, model } from 'tentjs'

export const reader = model('reader', { provider: 'openai-style', name: 'tiny', url: 'http://127.0.0.1:1/v1', abilities: ['reply'], takes: 4000 })

// An agent with no tool that is told its tools as a list: the list is handed with `call`, a tool all the same.
export const lister = agent('lister', { model: reader, instructions: 'You help.', tools: [], tell: 'list', limits: { steps: 12, perRun: { tokensOut: 50000 } } })
