import { action, change, flow, input, json, list, number, start, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

// A flow whose step says how far it has come, a moment apart, and that its starter may follow.
export const counting = flow('counting', {
  as: 'starter',
  access: 'signedIn',
  follow: 'signedIn',
  input: {},
  output: number(),
  run: async ({ step }) =>
    step('count', async ({ say }) => {
      for (let at = 1; at <= 3; at++) {
        say({ at })
        await new Promise((done) => setTimeout(done, 300))
      }
      return 3
    }),
})

// An action of the builder's own that starts the flow and answers its run, which the page then follows.
export const startCounting = action('startCounting', {
  access: 'signedIn',
  input: {},
  output: json(),
  run: async () => start(counting, {}),
})
