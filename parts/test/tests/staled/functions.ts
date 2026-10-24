import { change, event, flow, input, json, query, table, text } from 'tentjs'

export const news = table('news', {
  columns: { title: text() },
  access: { read: 'anyone', add: 'anyone' },
})

export const allNews = query('allNews', { access: 'anyone', rows: news.oldest('title') })

export const newsById = query('newsById', {
  access: 'anyone',
  input: { id: text() },
  rows: news.where({ id: input('id') }).first(),
})

export const addNews = change('addNews', {
  access: 'anyone',
  input: { title: text() },
  set: news.add({ title: input('title') }),
})

// What a cache outside is told, kept as rows: a flow that listens to the engine's event writes each one down.
export const staleNotes = table('staleNotes', {
  columns: { told: json() },
  access: { read: 'nobody', add: 'nobody' },
})

export const noteStale = change('noteStale', {
  access: 'nobody',
  input: { told: json() },
  set: staleNotes.add({ told: input('told') }),
})

export const allStale = query('allStale', { access: 'nobody', rows: staleNotes.oldest('createdAt') })

export const dropStale = flow('dropStale', {
  on: event('page.stale'),
  run: async ({ event: told, step }) => {
    await step('tell', () => noteStale({ told: told.data }))
  },
})
