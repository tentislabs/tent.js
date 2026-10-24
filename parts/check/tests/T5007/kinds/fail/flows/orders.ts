import { action, flow, number } from 'tentjs'

// A kind that the project does not state.
export const encode = action('encode', {
  access: 'signedIn',
  worker: 'tpu',
  input: { n: number() },
  sends: false,
  run: async ({ input }) => input.n,
})

// `worker` beside `background`.
export const both = action('both', {
  access: 'signedIn',
  worker: 'gpu',
  background: true,
  input: { n: number() },
  sends: false,
  run: async ({ input }) => input.n,
})

// On a kind that states `systemWork: false`: an action that runs as the system, and a step of a flow that runs as the system.
export const asSystem = action('asSystem', {
  access: 'signedIn',
  worker: 'locked',
  system: 'it reads every order',
  uses: [],
  input: { n: number() },
  sends: false,
  run: async ({ input }) => input.n,
})

export const steps = flow('steps', {
  run: async ({ step }) => {
    await step('nowhere', () => 1, { worker: 'tpu' })
    await step('locked', () => 2, { worker: 'locked', uses: [] })
  },
})

// A kind of worker named through a variable, which the project does not state.
const kind = 'quantum'

export const throughName = flow('throughName', {
  run: async ({ step }) => step('far', () => 1, { worker: kind }),
})
