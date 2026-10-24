import { flow, text } from 'tentjs'

// A run of each waits for a person, so that a publish meets runs that wait: one that stays on its version, and one
// that is moved where its steps still match.
export const approval = flow('approval', {
  input: { order: text() },
  run: async ({ input, step }) => {
    await step('note', () => input.order)
    await step.waitFor('approved')
    return step('done', () => `approved ${input.order}`)
  },
})

export const moving = flow('moving', {
  input: { order: text() },
  moveRuns: 'whenSafe',
  run: async ({ input, step }) => {
    await step('note', () => input.order)
    await step.waitFor('approved')
    return step('done', () => `moved ${input.order}`)
  },
})
