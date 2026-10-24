import { action, change, flow, input, list, number, query, runs, text } from 'tentjs'
import { marks, users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

// A subscription that bills once and renews as a new run, a hundred times: no run of it nears its limit of steps.
export const renew = flow('renew', {
  input: { n: number() },
  key: () => 'subscription',
  limits: { steps: 5 },
  run: async ({ input, step }) => {
    await step('bill', () => addMark({ what: `bill ${input.n}` }))
    if (input.n < 100) await step.again({ n: input.n + 1 })
    return input.n
  },
})

// A charge keeps the card it was handed in a sealed step, and uses it after a wait.
export const charge = flow('charge', {
  input: { card: text() },
  as: 'starter',
  run: async ({ input, step }) => {
    const kept = await step('card', () => ({ card: input.card }), { sealed: true })
    await step.wait('1 hour')
    await step('use', () => addMark({ what: `charged ${kept.card}` }))
  },
})

// A flow that renews with no input handed: the run before hands its own input on, three bills in all.
export const renewSame = flow('renewSame', {
  input: { label: text() },
  run: async ({ input, step, db }) => {
    const before = await step('count', async () => db.marks.where({ what: `same ${input.label}` }).count())
    await step('bill', () => addMark({ what: `same ${input.label}` }))
    if (before < 2) await step.again()
  },
})

// What code reads of the flows that stand paused.
export const pausedFlows = action('pausedFlows', {
  access: 'nobody',
  system: 'it reads which flows are paused',
  output: list(text()),
  run: async () => runs.paused(),
})

// Every step of this flow is sealed.
export const sealedWhole = flow('sealedWhole', {
  input: { word: text() },
  sealed: true,
  run: async ({ input, step }) => step('word', () => input.word),
})
