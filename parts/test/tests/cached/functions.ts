import { change, input, query, table, text } from 'tentjs'

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
