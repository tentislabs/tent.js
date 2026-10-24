import { action, flow, number } from 'tentjs'

export const encode = action('encode', {
  access: 'signedIn',
  worker: 'gpu',
  input: { n: number() },
  sends: false,
  run: async ({ input }) => input.n,
})

export const anywhere = action('anywhere', {
  access: 'signedIn',
  background: true,
  input: { n: number() },
  sends: false,
  run: async ({ input }) => input.n,
})

// On a kind that states `systemWork: false`: code that says what it uses, as its caller.
export const asCaller = action('asCaller', {
  access: 'signedIn',
  worker: 'locked',
  uses: [],
  input: { n: number() },
  sends: false,
  run: async ({ input }) => input.n,
})

export const steps = flow('steps', {
  as: 'starter',
  run: async ({ step }) => {
    await step('gpu', () => 1, { worker: 'gpu' })
    await step('any', () => 2, { worker: 'any' })
    await step('locked', () => 3, { worker: 'locked', uses: [] })
  },
})
