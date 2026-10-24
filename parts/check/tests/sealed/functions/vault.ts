import { col, count, fingerprint, input, query, table, text, concat } from 'tentjs'

// A sealed column that is only kept and handed out, with the fingerprint of its value beside it to find a row by.
export const vault = table('vault', {
  columns: {
    name: text(),
    key: text({ sealed: true }),
    keyPrint: text({ index: true }),
    label: text({ from: concat(col('name'), '!') }),
  },
  indexes: [['name']],
  search: ['name'],
  access: { read: 'signedIn' },
})

export const byName = query('byName', { access: 'signedIn', rows: vault.where({ name: 'door' }).limit(20) })

export const byPrint = query('byPrint', {
  access: 'signedIn',
  input: { key: text() },
  rows: vault.where({ keyPrint: fingerprint(input('key')) }).limit(20),
})

// T2011: a sealed column in an index, in `unique`, in `search`, and named by a `from`.

export const indexed = table('indexed', {
  columns: { name: text(), key: text({ sealed: true }) },
  indexes: [['name', 'key']],
  access: { read: 'signedIn' },
})

export const uniqued = table('uniqued', {
  columns: { name: text(), key: text({ sealed: true }) },
  unique: [['key']],
  access: { read: 'signedIn' },
})

export const searched = table('searched', {
  columns: { name: text(), key: text({ sealed: true }) },
  search: ['key'],
  access: { read: 'signedIn' },
})

export const worked = table('worked', {
  columns: { name: text(), key: text({ sealed: true }), copy: text({ from: concat(col('key'), '!') }) },
  access: { read: 'signedIn' },
})

export const flagged = table('flagged', {
  columns: { name: text(), key: text({ sealed: true, unique: true }), pin: text({ sealed: true, index: true }) },
  access: { read: 'signedIn' },
})

// T2011: a sealed column in a filter, a sort and a group, written with `rows` and in a body.

export const byKey = query('byKey', { access: 'signedIn', rows: vault.where({ key: 'door' }).limit(20) })

export const byEither = query('byEither', {
  access: 'signedIn',
  rows: vault.where({ any: [{ name: 'door' }, { not: { key: 'door' } }] }).limit(20),
})

export const sortedByKey = query('sortedByKey', { access: 'signedIn', rows: vault.newest('key').limit(20) })

export const groupedByKey = query('groupedByKey', { access: 'signedIn', rows: vault.group('key', { n: count() }) })

export const bodyByKey = query('bodyByKey', {
  access: 'signedIn',
  input: { key: text() },
  run: ({ db, input }) => db.vault.where({ key: input.key }).all(),
})

export const bodySorted = query('bodySorted', {
  access: 'signedIn',
  run: ({ db }) => db.vault.where({ name: 'door' }).sort('-key').limit(5).all(),
})
