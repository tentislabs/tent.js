import { link, list, model, table, text, vector, where } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const embedder = model('embedder', { provider: 'openai', name: 'text-embedding-3-small', abilities: ['embed'] })

// Another definition of the same model: its provider and its name are those of `embedder`.
export const same = model('same', { provider: 'openai', name: 'text-embedding-3-small', abilities: ['embed'] })

export const other = model('other', { provider: 'openai', name: 'text-embedding-3-large', abilities: ['embed'] })

export const articles = table('articles', {
  columns: {
    title: text(),
    kind: text(),
    meaning: vector({ size: 4, model: embedder }),
    loose: vector({ size: 4 }),
  },
  access: { read: 'signedIn', add: 'signedIn' },
})

// A vector column in an index.
export const indexed = table('indexed', {
  columns: { title: text(), meaning: vector({ size: 4 }) },
  indexes: [['title', 'meaning']],
  access: { read: 'signedIn' },
})

// A vector column in `unique`.
export const uniqued = table('uniqued', {
  columns: { title: text(), meaning: vector({ size: 4 }) },
  unique: [['meaning']],
  access: { read: 'signedIn' },
})

// A vector column in `search`.
export const searched = table('searched', {
  columns: { title: text(), meaning: vector({ size: 4 }) },
  search: ['title', 'meaning'],
  access: { read: 'signedIn' },
})

// A vector column named as `owner`.
export const owned = table('owned', {
  columns: { title: text(), meaning: vector({ size: 4 }) },
  owner: 'meaning',
  access: { read: 'signedIn' },
})

// A `near` in the filter of a `where` rule.
export const digests = table('digests', {
  columns: { article: link('articles') },
  access: { read: where({ article: { in: articles.near('meaning', [1, 0, 0, 0]).limit(3).pick(['id']) } }) },
})
