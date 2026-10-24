import { action, flow, text } from 'tentjs'

// A flow that the pages may call, which neither runs as its starter nor says why it has full access.
export const welcome = flow('welcome', {
  access: 'signedIn',
  input: { name: text() },
  run: async ({ input, step }) => step('greet', () => input.name),
})

// A flow with full access, which nothing offers.
export const tidy = flow('tidy', { run: async ({ step }) => step('work', () => 1) })

// An action that states no `system`, and calls that flow and waits for it.
export const tidyNow = action('tidyNow', {
  access: 'signedIn',
  run: async () => {
    await tidy()
  },
})
