import { action, number, table } from 'tentjs'
import { noted } from './helpers/seen.ts'

export const doubled = action('doubled', {
  access: 'nobody',
  system: 'fills the double of a number',
  input: { n: number() },
  output: number(),
  run: async ({ input }) => {
    await noted('doubled', input)
    return input.n * 2
  },
})

// A filled column whose pass is held to two rows a minute.
export const sizes = table('sizes', {
  columns: { n: number(), double: number({ optional: true, by: { work: doubled, limits: { perMinute: 2 } } }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})
