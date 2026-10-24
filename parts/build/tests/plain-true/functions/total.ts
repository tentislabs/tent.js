import { number, query } from 'tentjs'

export const total = query('total', {
  access: 'signedIn',
  input: { n: number() },
  output: number(),
  plain: true,
  run: ({ input }) => {
    return Math.round(input.n)
  },
})
