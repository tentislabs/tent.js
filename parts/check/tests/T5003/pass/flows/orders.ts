import { flow, text } from 'tentjs'

// Each step that runs which have not ended depend on still stands under its name.
export const bigOrder = flow('bigOrder', {
  input: { title: text() },
  run: async ({ input, step }) => {
    await step('tell sales', () => input.title)
    const said = await step.waitFor('approval')
    await step.wait('1 day')
    return said
  },
})
