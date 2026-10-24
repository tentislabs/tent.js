import { action, allow, change, each, list, log, number, object, query, sum, text, concat } from 'tentjs'
import { items } from '../tables/items'

// The definitions of `plain.ts` once more, each with one harmless call of a function of the file's own, which
// makes its `run` code.

const harmless = (): number => 0

export const listCode = query('listCode', {
  access: 'signedIn',
  input: { min: number() },
  output: object({ count: number(), titles: list(text()), top: text() }),
  run: ({ db, input }) => {
    harmless()
    const rows = db.items.where({ n: { atLeast: input.min } }).sort('n').all()
    if (rows.length === 0) return { count: 0, titles: [], top: 'none' }
    return { count: rows.length, titles: each(rows, (row) => row.title), top: rows[0].title }
  },
})

export const addCode = change('addCode', {
  access: 'signedIn',
  input: { title: text(), n: number() },
  output: object({ title: text(), n: number(), twice: number() }),
  run: ({ db, input }) => {
    harmless()
    const row = db.items.add({ title: input.title, n: input.n })
    log.info('an item was added', { n: input.n })
    return { title: row.title, n: row.n, twice: row.n * 2 }
  },
})

export const totalCode = action('totalCode', {
  access: 'signedIn',
  input: { title: text() },
  output: object({ total: number(), added: text() }),
  run: async ({ db, input }) => {
    harmless()
    const before = await db.items.where({ n: { atLeast: 0 } }).all()
    const added = await addCode({ title: input.title, n: 7 })
    return { total: sum(before, 'n'), added: added.title }
  },
})

export const quietCode = action('quietCode', {
  access: 'signedIn',
  input: { name: text() },
  output: text(),
  run: async ({ input }) => {
    harmless()
    return concat('hello ', input.name)
  },
})

export const touch = change('touch', {
  access: 'signedIn',
  set: items.add({ title: 'touched', n: 0 }),
})

// A rule reads, and calls queries and value words: one whose arrow calls a change is refused while it runs.
export const ruleWrites = query('ruleWrites', {
  access: allow(() => {
    touch({})
    return true
  }),
  rows: items.limit(5),
})
