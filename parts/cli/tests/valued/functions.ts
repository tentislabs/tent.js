import { action, anyone, number, object, query, secrets, settings, text } from 'tentjs'

const open = anyone('a project of the tests, which nobody else reaches')

// The code opens a secret, and answers only how long it is.
export const lengthOfKey = action('lengthOfKey', {
  access: open,
  input: { name: text({ default: 'PAY_KEY' }) },
  output: number(),
  run: async ({ input }) => secrets[input.name].reveal().length,
})

export const shown = query('shown', {
  access: open,
  output: object({ shopName: text(), maxItems: number() }),
  run: () => ({ shopName: settings.shopName, maxItems: settings.maxItems }),
})
