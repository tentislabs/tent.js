import { flow, text } from 'tentjs'

// A run waits for a person, so that a version published meanwhile leaves it on the code it started with.
export const waiting = flow('waiting', {
  input: { order: text() },
  run: async ({ input, step }) => {
    await step('note', () => input.order)
    await step.waitFor('approved')
    return step('done', () => `approved ${input.order}`)
  },
})
