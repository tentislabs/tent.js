import { action, date, list, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const deals = table('deals', {
  columns: { title: text(), endsAt: date() },
  access: { read: 'anyone' },
})

export const allDeals = query('allDeals', { access: 'anyone', rows: deals.oldest('title') })

// An action that never answers: the engine ends it after the time of an action.
export const never = action('never', {
  access: 'anyone',
  run: () => new Promise(() => undefined),
})
