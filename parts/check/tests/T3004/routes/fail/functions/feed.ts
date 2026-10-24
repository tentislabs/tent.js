import { flow, list, route, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

// A flow with full access, which nothing offers.
export const tidy = flow('tidy', { run: async ({ step }) => step('work', () => 1) })

// A route that reads through `db.system`, and one that waits for the flow, each with no `system`.
export const feed = route('feed', {
  method: 'GET',
  path: '/feed',
  access: 'signedIn',
  run: async ({ db }) => {
    await db.system.notes.count()
    return new Response('ok')
  },
})

export const tidyNow = route('tidyNow', {
  method: 'POST',
  path: '/tidy',
  access: 'signedIn',
  run: async () => {
    await tidy()
    return new Response('tidied')
  },
})
