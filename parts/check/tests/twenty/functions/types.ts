import { boolean, date, list, number, query, text } from 'tentjs'

const NONE = ['none']
const limit: number = 'twenty'

export const isNow = query('isNow', {
  access: 'signedIn',
  about: String(limit),
  input: { at: date() },
  output: boolean(),
  run: ({ input, now }) => input.at == now,
})

export const untagged = query('untagged', {
  access: 'signedIn',
  input: { tags: list(text()) },
  output: boolean(),
  run: ({ input }) => input.tags == NONE,
})

export const total = query('total', {
  access: 'signedIn',
  input: { n: number() },
  output: number(),
  plain: true,
  run: ({ input }) => Math.round(input.n),
})
