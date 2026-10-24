import { input, query, table, text } from 'tentjs'

export const accounts = table('accounts', {
  columns: { name: text(), email: text({ sealed: { findable: true } }) },
  access: { read: 'signedIn' },
})

// A fingerprint has no order: a sort and a range by it cannot be answered.
export const byEmailOrder = query('byEmailOrder', { access: 'signedIn', rows: accounts.sort('email').limit(10) })

export const emailsAfter = query('emailsAfter', {
  access: 'signedIn',
  input: { email: text() },
  rows: accounts.where({ email: { above: input('email') } }).limit(10),
})
