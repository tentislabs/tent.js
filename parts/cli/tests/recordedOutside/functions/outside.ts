import { action, model, text } from 'tentjs'

// A model of a provider that `engine.ts` makes, which no test fakes.
export const painter = model('painter', { provider: 'mine', name: 'p-1', input: { prompt: text() }, output: text() })

// A plain `fetch` of the app's code, which leaves the program.
export const fetchHere = action('fetchHere', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () =>
    fetch('http://127.0.0.1:9/').then(
      () => 'answered',
      () => 'refused',
    ),
})

export const paint = action('paint', {
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => String(await painter({ prompt: 'a lamp' })),
})
