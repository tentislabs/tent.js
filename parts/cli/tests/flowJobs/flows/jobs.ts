import { boolean, every, fail, flow, text } from 'tentjs'

// A job breaks at its first step where it is told to, and else waits for a word to end.
export const job = flow('job', {
  input: { name: text(), breaks: boolean() },
  key: ({ input }) => input.name,
  run: async ({ input, step }) => {
    await step('work', () => {
      if (input.breaks) fail('broken', `The job ${input.name} broke.`)
      return input.name
    })
    await step.waitFor('done')
    return input.name
  },
})

// A flow that is paused by a test: each run marks its step, waits an hour, and marks again.
export const tick = flow('tick', {
  input: { name: text() },
  together: { max: 1 },
  run: async ({ input, step }) => {
    await step('before', () => input.name)
    await step.wait('1 hour')
    return step('after', () => input.name)
  },
})

// A flow of each quarter of an hour: two days of it are more runs than a catch-up starts without `--yes`.
export const often = flow('often', {
  on: every('15 minutes'),
  run: async ({ event, step }) => step('at', () => event.at.toISOString()),
})

// A flow of each day, whose missed days a test makes up with `--times`.
export const daily = flow('daily', {
  on: every('day at 09:00'),
  run: async ({ event, step }) => step('at', () => event.at.toISOString()),
})
