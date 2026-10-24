import { change, flow, input, query, text } from 'tentjs'
import { marks } from './tables.ts'

export const addMark = change('addMark', {
  access: 'anyone',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'anyone', rows: marks.oldest('createdAt') })

// A run that waits an hour, and then leaves its mark: what is due of an app that sleeps.
export const napping = flow('napping', {
  run: async ({ step }) => {
    await step.wait('1 hour')
    await step('mark', () => addMark({ what: 'woke' }))
  },
})
