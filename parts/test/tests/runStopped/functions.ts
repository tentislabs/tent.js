import { action, change, flow, input, json, list, start, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

// A flow whose one step works for a long time, which its starter may follow and stop.
export const waiting = flow('waiting', {
  as: 'starter',
  access: 'signedIn',
  follow: 'signedIn',
  input: {},
  run: async ({ step }) =>
    step('wait', async ({ say }) => {
      say({ waits: true })
      await new Promise((done) => setTimeout(done, 8000))
      return null
    }),
})

// An action of the builder's own that starts the flow and answers its run, which the page then follows.
export const startWaiting = action('startWaiting', {
  access: 'signedIn',
  input: {},
  output: json(),
  run: async () => start(waiting, {}),
})
