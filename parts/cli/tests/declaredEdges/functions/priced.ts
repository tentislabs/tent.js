import { action, allow, number } from 'tentjs'

// A price that its own code takes up to 60 alone: its edge at the most fails, and is cut down to the least that fails.
export const priced = action('priced', {
  access: allow((user) => user?.roles.includes('staff') === true),
  input: { price: number({ min: 0, max: 100 }) },
  output: number(),
  run: async ({ input: given }) => {
    if (given.price > 60) throw new Error(`a price of ${given.price} is too dear`)
    return given.price
  },
})
