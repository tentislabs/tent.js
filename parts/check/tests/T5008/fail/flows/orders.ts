import { action, number } from 'tentjs'

// A helper of the file makes the action code: what it sends out is not known.
const twice = (n: number): number => n * 2

// An action on a worker that may send what it sends twice.
export const encode = action('encode', {
  access: 'signedIn',
  background: true,
  input: { n: number() },
  run: async ({ input }) => twice(input.n),
})
