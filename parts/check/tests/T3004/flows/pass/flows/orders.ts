import { action, flow, start, text } from 'tentjs'

// A flow that the pages may call runs as its starter, or says why it has full access.
export const welcome = flow('welcome', {
  access: 'signedIn',
  as: 'starter',
  input: { name: text() },
  run: async ({ input, step }) => step('greet', () => input.name),
})

export const report = flow('report', {
  access: 'signedIn',
  system: 'it reads the orders of every customer to add them up',
  input: { month: text() },
  run: async ({ input, step }) => step('add up', () => input.month),
})

// A flow with full access, which nothing offers.
export const tidy = flow('tidy', { run: async ({ step }) => step('work', () => 1) })

// An action that states `system` may call it and wait, and any action may start it, or call a flow that runs as its starter.
export const tidyNow = action('tidyNow', {
  access: 'signedIn',
  system: 'it waits for the flow that tidies, which has full access',
  run: async () => {
    await tidy()
  },
})

export const tidyLater = action('tidyLater', {
  access: 'signedIn',
  run: async () => {
    start(tidy)
    await welcome({ name: 'Ada' })
  },
})
