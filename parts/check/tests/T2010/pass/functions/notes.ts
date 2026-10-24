import { input, model, query, table, text, vector } from 'tentjs'

export const embedder = model('embedder', { provider: 'openai', name: 'text-embedding-3-small', abilities: ['embed'] })

export const other = model('other', { provider: 'openai', name: 'text-embedding-3-large', abilities: ['embed'] })

export const articles = table('articles', {
  columns: { title: text(), kind: text(), meaning: vector({ size: 4, model: embedder }) },
  access: { read: 'signedIn' },
})

export const near = query('near', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles.where({ kind: 'guide' }).near('meaning', input('to')).limit(5),
})
