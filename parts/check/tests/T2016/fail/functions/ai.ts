import { change, flow, list, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const usage = table('usage', { shows: 'counts', access: { read: 'owner', add: 'signedIn' } })

export const ratings = table('ratings', { shows: 'scores', access: { read: 'owner', add: 'signedIn' } })

export const scored = change('scored', { access: 'signedIn', input: {}, run: ({ db }) => db.ratings.add({ score: 1 }) })

export const wrote = change('wrote', { access: 'signedIn', input: {}, run: ({ db }) => db.usage.add({ unit: 'x' }) })

export const found = query('found', { access: 'signedIn', input: {}, run: ({ db }) => db.usage.search('x').limit(5).all() })

export const onUse = flow('onUse', {
  on: usage.added(),
  run: async ({ step }) => {
    await step('one', () => 1)
  },
})
