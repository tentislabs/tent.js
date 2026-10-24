import { anyone, change, input, number, query, text } from 'tentjs'
import { orders, teams } from '../tables/tables'

const open = anyone('a test calls it')

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

export const addOrder = change('addOrder', {
  access: open,
  input: { team: text(), title: text() },
  set: orders.of(input('team')).add({ title: input('title') }),
})

// Raw SQL of a function with full access, in the file of one tenant, that names another tenant's id in its text.
// It reads the file of `team` alone, so a `where` on another team's id finds nothing: it answers the count it found.
export const rawNamesOther = query('rawNamesOther', {
  access: open,
  system: 'a function with full access reads one tenant file by raw SQL',
  input: { team: text(), other: text() },
  output: number(),
  run: ({ db, input: given }) =>
    db.sql('SELECT "title" FROM "orders" WHERE "team" = ?', [given.other], { of: given.team }).length,
})

// A control: the same raw SQL that names its own tenant answers the orders it holds.
export const rawNamesOwn = query('rawNamesOwn', {
  access: open,
  system: 'a function with full access reads its own tenant file by raw SQL',
  input: { team: text() },
  output: number(),
  run: ({ db, input: given }) =>
    db.sql('SELECT "title" FROM "orders" WHERE "team" = ?', [given.team], { of: given.team }).length,
})

// Raw SQL that names a table of the engine, in a tenant file: it is refused before it runs.
export const rawMeta = query('rawMeta', {
  access: open,
  system: 'a function with full access tries to read the engine own table of a tenant file',
  input: { team: text() },
  output: number(),
  run: ({ db, input: given }) => db.sql('SELECT "value" FROM "_t_meta"', [], { of: given.team }).length,
})

export const rawSessions = query('rawSessions', {
  access: open,
  system: 'a function with full access tries to read the sessions of the app from a tenant file',
  input: { team: text() },
  output: number(),
  run: ({ db, input: given }) => db.sql('SELECT * FROM "_t_sessions"', [], { of: given.team }).length,
})

// Raw SQL that tries to open another file, read the file itself, or hold more than one statement: each is refused.
export const rawAttach = query('rawAttach', {
  access: open,
  system: 'a function with full access tries to attach another data file',
  input: { team: text(), path: text() },
  output: number(),
  run: ({ db, input: given }) => db.sql(`ATTACH DATABASE '${given.path}' AS "other"`, [], { of: given.team }).length,
})

export const rawPragma = query('rawPragma', {
  access: open,
  system: 'a function with full access tries to read what tells of the data file itself',
  input: { team: text() },
  output: number(),
  run: ({ db, input: given }) => db.sql('SELECT "name" FROM pragma_database_list', [], { of: given.team }).length,
})

export const rawTwo = query('rawTwo', {
  access: open,
  system: 'a function with full access tries two statements in one raw text',
  input: { team: text() },
  output: number(),
  run: ({ db, input: given }) => db.sql('SELECT 1 AS n; DROP TABLE "orders"', [], { of: given.team }).length,
})
