import { action, flow, number } from 'tentjs'

// A step that remembers its answer by the values it rests on.
export const remembers = flow('remembers', {
  input: { n: number() },
  run: async ({ input, step }) => step('slow', () => input.n, { worker: 'gpu', remember: { key: [input.n] } }),
})

// An action that changes nothing and calls nothing that writes.
export const quiet = action('quiet', {
  access: 'signedIn',
  changes: false,
  input: { n: number() },
  run: async ({ input: given }) => given.n,
})

// `follow` on an action that is a run, with work seconds in its limit.
export const followed = action('followed', {
  access: 'signedIn',
  background: true,
  sends: false,
  follow: 'signedIn',
  limits: { perDay: { workSeconds: 60 } },
  input: { n: number() },
  run: async ({ input: given }) => given.n,
})
