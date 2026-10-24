import { input, query, table, text } from 'tentjs'

export const accounts = table('accounts', {
  columns: { name: text(), email: text({ sealed: { findable: true } }) },
  access: { read: 'signedIn' },
})

// An equal value is what a fingerprint answers.
export const byEmail = query('byEmail', {
  access: 'signedIn',
  input: { email: text() },
  rows: accounts.where({ email: input('email') }).limit(10),
})
