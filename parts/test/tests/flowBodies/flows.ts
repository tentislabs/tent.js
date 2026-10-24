import { each, flow, range, sum, text, concat } from 'tentjs'
import { flaky, note } from './functions.ts'

// A flow whose `run` holds only our words: it is read and stored, and never built into a module.
export const plainFive = flow('plainFive', {
  input: { name: text() },
  run: async ({ input, step }) => {
    for (const n of [1, 2, 3, 4, 5]) {
      await step('note', () => note({ what: concat(input.name, ' ', n) }))
    }
    return input.name
  },
})

const same = (n: number): number => n

// The same flow, made code by one harmless call of a function of the file's own.
export const codeFive = flow('codeFive', {
  input: { name: text() },
  run: async ({ input, step }) => {
    for (const n of [1, 2, 3, 4, 5]) {
      await step('note', () => note({ what: concat(input.name, ' ', same(n)) }))
    }
    return input.name
  },
})

// A plain flow that waits, and whose last step fails at its first try.
export const plainWaits = flow('plainWaits', {
  moveRuns: 'whenSafe',
  run: async ({ step }) => {
    await step('before', () => note({ what: 'before the wait' }))
    await step.wait('1 hour')
    const worked = await step('flaky', () => flaky())
    return worked
  },
})

// A plain flow that works for long between two steps.
export const plainSlow = flow('plainSlow', {
  limits: { pass: '30 ms' },
  run: async ({ step }) => {
    await step('first', () => note({ what: 'slow' }))
    const total = sum(each(range(0, 400000), (n) => n * 2))
    await step('second', () => note({ what: concat('total ', total) }))
    return total
  },
})
