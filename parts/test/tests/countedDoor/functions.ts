import { flow, incoming, number, query, route, table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { title: text() },
  access: { read: 'anyone', add: 'anyone' },
})

// A query that holds the processor a while, so that the time a screen spends on it can be seen.
export const busyCount = query('busyCount', {
  access: 'anyone',
  output: number(),
  run: ({ db }) => {
    let sum = 0
    for (let i = 0; i < 20_000_000; i++) sum += i % 7
    return db.notes.count() + (sum % 1)
  },
})

export const feed = route('feed', {
  method: 'GET',
  path: '/feed',
  access: 'anyone',
  run: () => new Response('the feed of the shop'),
})

export const received = flow('received', { run: async () => undefined })

export const openEvents = incoming('openEvents', {
  path: '/hooks/open',
  open: 'a test sends calls that nobody signs',
  then: received,
})
