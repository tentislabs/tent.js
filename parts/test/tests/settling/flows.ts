import { flow } from 'tentjs'
import { addMark } from './functions.ts'

// A run that waits for a time between its two steps.
export const later = flow('later', {
  run: async ({ step }) => {
    await step('first', () => addMark({ what: 'first' }))
    await step.wait('1 hour')
    await step('second', () => addMark({ what: 'second' }))
  },
})

// A run that waits for a person.
export const asks = flow('asks', {
  run: async ({ step }) => {
    const said = await step.waitFor('approval')
    await step('after', () => addMark({ what: `approved ${said.approved}` }))
  },
})

// A run whose one step works for a while on the real clock.
export const slow = flow('slow', {
  run: async ({ step }) => {
    await step('work', async () => {
      await new Promise((done) => setTimeout(done, 300))
      return addMark({ what: 'slow' })
    })
  },
})
