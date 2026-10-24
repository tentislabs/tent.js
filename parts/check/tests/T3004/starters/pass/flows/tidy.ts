import { flow, list, start, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

// A flow with full access, which nothing offers, may use it.
export const sweep = flow('sweep', {
  run: async ({ step, db }) => step('work', () => db.system.notes.count()),
})

// A flow that runs as its starter reads through `db`, under the rules of its caller, and starts the other.
export const tidy = flow('tidy', {
  as: 'starter',
  run: async ({ step, db }) => {
    await step('one', () => db.notes.count())
    await step('two', () => start(sweep))
  },
})
