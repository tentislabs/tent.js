import { action, number } from 'tentjs'

// An action on a worker that says it sends nothing out.
export const encode = action('encode', {
  access: 'signedIn',
  background: true,
  sends: false,
  input: { n: number() },
  run: async ({ input }) => input.n,
})

// An action that runs where it is called.
export const plain = action('plain', {
  access: 'signedIn',
  input: { n: number() },
  run: async ({ input }) => input.n,
})
