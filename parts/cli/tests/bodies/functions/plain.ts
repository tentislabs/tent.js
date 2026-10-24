import {
  action,
  allow,
  change,
  each,
  fail,
  input,
  link,
  list,
  log,
  number,
  object,
  query,
  range,
  sum,
  text,
  concat,
} from 'tentjs'
import { items } from '../tables/items'

// Each `run` here holds only our words, so the build reads it and stores it as a body.

export const listPlain = query('listPlain', {
  access: 'signedIn',
  input: { min: number() },
  output: object({ count: number(), titles: list(text()), top: text() }),
  run: ({ db, input }) => {
    const rows = db.items.where({ n: { atLeast: input.min } }).sort('n').all()
    if (rows.length === 0) return { count: 0, titles: [], top: 'none' }
    return { count: rows.length, titles: each(rows, (row) => row.title), top: rows[0].title }
  },
})

export const addPlain = change('addPlain', {
  access: 'signedIn',
  input: { title: text(), n: number() },
  output: object({ title: text(), n: number(), twice: number() }),
  run: ({ db, input }) => {
    const row = db.items.add({ title: input.title, n: input.n })
    log.info('an item was added', { n: input.n })
    return { title: row.title, n: row.n, twice: row.n * 2 }
  },
})

export const totalPlain = action('totalPlain', {
  access: 'signedIn',
  input: { title: text() },
  output: object({ total: number(), added: text() }),
  run: async ({ db, input }) => {
    const before = await db.items.where({ n: { atLeast: 0 } }).all()
    const added = await addPlain({ title: input.title, n: 7 })
    return { total: sum(before, 'n'), added: added.title }
  },
})

// Written `async`, with no `await` inside it.
export const quietPlain = action('quietPlain', {
  access: 'signedIn',
  input: { name: text() },
  output: text(),
  run: async ({ input }) => concat('hello ', input.name),
})

// It fails at its last statement: the row it added before is not kept.
export const failsLast = change('failsLast', {
  access: 'signedIn',
  input: { title: text() },
  run: ({ db, input }) => {
    db.items.add({ title: input.title, n: 1 })
    fail('not-kept', 'Nothing of this change is kept.')
  },
})

// A change waits for nothing: an arrow of `each` that answers a promise ends it.
export const waitsInEach = change('waitsInEach', {
  access: 'signedIn',
  input: { title: text() },
  run: ({ db, input }) => {
    db.items.add({ title: input.title, n: 1 })
    each([1, 2, 3], async (n) => n)
  },
})

// A list of a million entries, walked a row at a time: far past the time of a query.
export const walks = query('walks', {
  access: 'signedIn',
  output: number(),
  run: () => sum(each(range(0, 1000), (a) => sum(each(range(0, 1000), (b) => a * b)))),
})

// Two queries that call each other, and never come to an end by themselves.
export const ping = query('ping', {
  access: 'signedIn',
  input: { n: number() },
  output: number(),
  run: ({ input }) => pong({ n: input.n + 1 }),
})

export const pong = query('pong', {
  access: 'signedIn',
  input: { n: number() },
  output: number(),
  run: ({ input }) => ping({ n: input.n + 1 }),
})

// The rule reads `db`: only a member of the team is let in.
export const teamItems = query('teamItems', {
  access: allow((user, input, db) => db.members.where({ team: input.team, user: user?.id }).count() > 0),
  input: { team: link('teams') },
  rows: items.where({ team: input('team') }).limit(50),
})
