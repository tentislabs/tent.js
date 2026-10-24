import { change, flow, input, table, text, concat } from 'tentjs'

export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn' },
})

export const addMark = change('addMark', {
  access: 'nobody',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

// Every definition of this file is plain: the build reads it, and runs none of it.
export const welcome = flow('welcome', {
  input: { name: text() },
  run: async ({ input, step }) => {
    await step('mark', () => addMark({ what: concat('welcome ', input.name) }))
    await step.wait('1 day')
    await step('mark again', () => addMark({ what: concat('still welcome ', input.name) }))
    return input.name
  },
  onFail: async ({ failure, step }) => {
    await step('note', () => addMark({ what: concat('failed with ', failure.code) }))
  },
})
