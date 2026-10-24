import { action, change, count, input, query, text, vector } from 'tentjs'
import { articles, embedder, other, same } from '../tables/articles'

// What is as the documents ask, and is found with nothing.

export const near = query('near', {
  access: 'signedIn',
  input: { to: vector({ size: 4, model: embedder }) },
  rows: articles.near('meaning', input('to')).limit(10),
})

export const nearSame = query('nearSame', {
  access: 'signedIn',
  input: { to: vector({ size: 4, model: same }) },
  rows: articles.near('meaning', input('to')).limit(10),
})

export const nearNoModel = query('nearNoModel', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles.near('meaning', input('to')).limit(10),
})

export const nearLoose = query('nearLoose', {
  access: 'signedIn',
  input: { to: vector({ size: 4, model: other }) },
  rows: articles.near('loose', input('to')).limit(10),
})

export const joined = query('joined', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles
    .where({ kind: 'guide' })
    .near('meaning', input('to'), { measure: 'straight', within: 0.4 })
    .limit(5)
    .pick(['id', 'title']),
})

export const nearest = query('nearest', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles.near('meaning', input('to')).first(),
})

export const unfilled = query('unfilled', {
  access: 'signedIn',
  rows: articles.where({ meaning: { empty: true } }).limit(20),
})

export const nearList = query('nearList', {
  access: 'signedIn',
  rows: articles.near('meaning', [1, 0, 0, 0]).limit(3),
})

export const embedSame = action('embedSame', {
  access: 'signedIn',
  input: { words: text() },
  run: async ({ db, input }) => {
    const made = await embedder.embed(input.words)
    await db.articles.near('meaning', made).limit(3).all()
  },
})

export const bodyNear = query('bodyNear', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  run: ({ db, input }) => {
    const found = db.articles.where({ kind: 'guide' }).near('meaning', input.to)
    return found.limit(3).all()
  },
})

// T2008: a `near` value whose size is not the column's.

export const wrongSize = query('wrongSize', {
  access: 'signedIn',
  input: { to: vector({ size: 3 }) },
  rows: articles.near('meaning', input('to')).limit(10),
})

export const wrongList = query('wrongList', {
  access: 'signedIn',
  rows: articles.near('meaning', [1, 0, 0]).limit(10),
})

export const bodyWrongSize = query('bodyWrongSize', {
  access: 'signedIn',
  input: { to: vector({ size: 3 }) },
  run: ({ db, input }) => db.articles.near('meaning', input.to).limit(3).all(),
})

// T2009: `near` with neither `limit` nor `first()`.

export const noLimit = query('noLimit', {
  access: 'signedIn',
  live: false,
  input: { to: vector({ size: 4 }) },
  rows: articles.near('meaning', input('to')),
})

export const bodyNoLimit = query('bodyNoLimit', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  run: ({ db, input }) => db.articles.near('meaning', input.to).all(),
})

// T2010: a vector column used as an ordinary one, and `near` where it does not belong.

export const filtered = query('filtered', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles.where({ meaning: input('to') }).limit(5),
})

export const sorted = query('sorted', { access: 'signedIn', rows: articles.sort('meaning').limit(5) })

export const grouped = query('grouped', { access: 'signedIn', rows: articles.group('meaning', { n: count() }) })

export const notVector = query('notVector', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles.near('title', input('to')).limit(5),
})

export const withSearch = query('withSearch', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }), words: text() },
  rows: articles.search(input('words')).near('meaning', input('to')).limit(5),
})

export const withSort = query('withSort', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles.near('meaning', input('to')).newest('title').limit(5),
})

export const withCount = query('withCount', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles.near('meaning', input('to')).limit(5).count(),
})

export const withSkip = query('withSkip', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles.near('meaning', input('to')).skip(2).limit(5),
})

export const insideIn = query('insideIn', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  rows: articles.where({ id: { in: articles.near('meaning', input('to')).limit(3).pick(['id']) } }).limit(5),
})

export const bodyFiltered = query('bodyFiltered', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  run: ({ db, input }) => db.articles.where({ meaning: input.to }).all(),
})

export const bodySorted = query('bodySorted', {
  access: 'signedIn',
  input: { to: vector({ size: 4 }) },
  run: ({ db, input }) => db.articles.near('meaning', input.to).newest('title').limit(3).all(),
})

// T2012: a value of another model than the column states.

export const otherModel = query('otherModel', {
  access: 'signedIn',
  input: { to: vector({ size: 4, model: other }) },
  rows: articles.near('meaning', input('to')).limit(10),
})

export const writeOther = change('writeOther', {
  access: 'signedIn',
  input: { title: text(), made: vector({ size: 4, model: other }) },
  set: articles.add({ title: input('title'), kind: 'guide', meaning: input('made') }),
})

export const writeSame = change('writeSame', {
  access: 'signedIn',
  input: { title: text(), made: vector({ size: 4, model: same }) },
  set: articles.add({ title: input('title'), kind: 'guide', meaning: input('made') }),
})

export const embedOther = action('embedOther', {
  access: 'signedIn',
  input: { words: text() },
  run: async ({ db, input }) => {
    const made = await other.embed(input.words)
    await db.articles.near('meaning', made).limit(3).all()
  },
})

export const bodyOtherModel = query('bodyOtherModel', {
  access: 'signedIn',
  input: { to: vector({ size: 4, model: other }) },
  run: ({ db, input }) => db.articles.near('meaning', input.to).limit(3).all(),
})

export const bodyWriteOther = change('bodyWriteOther', {
  access: 'signedIn',
  input: { title: text(), made: vector({ size: 4, model: other }) },
  run: ({ db, input }) => {
    db.articles.add({ title: input.title, kind: 'guide', meaning: input.made })
  },
})
