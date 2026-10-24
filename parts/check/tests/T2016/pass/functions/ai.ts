import { list, query, sum, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const usage = table('usage', { shows: 'counts', access: { read: 'owner' } })

export const ratings = table('ratings', { shows: 'scores', access: { read: 'owner' } })

export const myScores = query('myScores', { access: 'signedIn', input: {}, rows: ratings.where({}).limit(20) })

export const myUse = query('myUse', {
  access: 'signedIn',
  input: {},
  rows: usage.where({}).group('unit', { amount: sum('amount') }).limit(20),
})
