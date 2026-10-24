import { action, input, link, list, model, object, query, secret, table, text, vector } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const reranker = model('reranker', {
  provider: 'anthropic',
  name: 'rerank-1',
  key: secret('ANTHROPIC_KEY'),
  abilities: ['rank'],
})

// Each person reads the articles they wrote.
export const articles = table('articles', {
  columns: { title: text(), meaning: vector({ size: 3 }), by: link('users', { optional: true }) },
  owner: 'by',
  search: ['title'],
  access: { read: 'owner', add: 'nobody' },
})

// Words and meaning together, in one plan that a query holds.
export const both = query('both', {
  access: 'signedIn',
  input: { words: text(), to: vector({ size: 3 }) },
  rows: articles.search(input('words')).near('meaning', input('to')).limit(5),
})

// The same, reordered by a model that ranks: a model call, so it stands in an action.
export const ranked = action('ranked', {
  access: 'signedIn',
  input: { words: text(), to: vector({ size: 3 }) },
  output: list(object({ id: text(), title: text() })),
  run: async ({ db, input }) =>
    db.articles
      .search(input.words)
      .near('meaning', input.to.slice())
      .limit(5)
      .rank(reranker, input.words, { top: 2 })
      .all(),
})

// A query may call no model, so a plan in it that ranks is refused.
export const rankedRead = query('rankedRead', {
  access: 'signedIn',
  input: { words: text() },
  run: ({ db, input }) => db.articles.search(input.words).limit(5).rank(reranker, input.words).all(),
})
