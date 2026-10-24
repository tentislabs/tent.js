import { flow, text } from 'tentjs'

// Runs of this flow that have not ended saved a step named `tell sales`, and wait at `approval`: the first is
// renamed here, so those runs depend on a name that is gone.
export const bigOrder = flow('bigOrder', {
  input: { title: text() },
  run: async ({ input, step }) => {
    await step('tell the sales team', () => input.title)
    const said = await step.waitFor('approval')
    return said
  },
})
