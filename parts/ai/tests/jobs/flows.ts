import { flow, model, text } from 'tentjs'

// A model whose server does its work by itself: its provider, made by the program, begins a job and checks it.
export const maker = model('maker', {
  provider: 'jobs',
  name: 'maker-1',
  input: { prompt: text() },
  output: text(),
  limits: { time: '10 minutes' },
})

export const makeIt = flow('makeIt', {
  run: async ({ step }) => step('make', () => maker({ prompt: 'a tent' })),
})
