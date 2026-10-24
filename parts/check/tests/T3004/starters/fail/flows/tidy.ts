import { flow, list, table, text } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

// A flow with full access, which nothing offers.
export const sweep = flow('sweep', { run: async ({ step }) => step('work', () => 1) })

// A flow that runs as its starter, and so has the rights of its caller alone: it reads through `db.system`, and
// waits for the flow with full access.
export const tidy = flow('tidy', {
  as: 'starter',
  run: async ({ step, db }) => {
    await step('one', () => db.system.notes.count())
    await step('two', () => sweep())
  },
})
