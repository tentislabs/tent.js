import { flow, text } from 'tentjs'

// A run whose step reads the private value of a card, and then waits for a yes.
export const lookCard = flow('lookCard', {
  input: { id: text() },
  run: async ({ input, step, db }) => {
    const found = await step('read', async () => String((await db.cards.get(input.id))?.ssn))
    await step.waitFor('approval')
    return found
  },
})
