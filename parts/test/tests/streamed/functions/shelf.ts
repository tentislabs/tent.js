import { fail, number, query, table, text } from 'tentjs'

export const notes = table('notes', {
  columns: { name: text({ unique: true }) },
  access: { read: 'anyone' },
})

export const allNotes = query('allNotes', { access: 'anyone', rows: notes.oldest('name').limit(50) })

/** Counts up to a number in the store, one row at a time, and answers how many it counted. */
function counted(db: { sql(text: string, values: unknown[]): unknown[] }, upTo: number): number {
  const [row] = db.sql('WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?) SELECT count(*) AS "c" FROM n', [upTo])
  return Number(Object(row).c)
}

// Counts up to a number in the store, which takes the store a while: the slow data of a page.
export const slowCount = query('slowCount', {
  access: 'anyone',
  heavy: true,
  system: 'a test counts in the store for a while, with no table',
  input: { upTo: number() },
  output: number(),
  run: ({ db, input: given }) => counted(db, given.upTo),
})

// Counts as long, and then fails.
export const slowFailing = query('slowFailing', {
  access: 'anyone',
  heavy: true,
  system: 'a test counts in the store for a while, with no table',
  input: { upTo: number() },
  output: number(),
  run: ({ db, input: given }) => {
    if (counted(db, given.upTo) > 0) fail('not-counted', 'The count did not finish.')
    return 0
  },
})

// A note by its name, read as slowly: a needed entry of a screen.
export const slowNote = query('slowNote', {
  access: 'anyone',
  heavy: true,
  system: 'a test counts in the store for a while before it reads the note',
  input: { name: text(), upTo: number() },
  run: ({ db, input: given }) => (counted(db, given.upTo) > 0 ? db.notes.where({ name: given.name }).first() : undefined),
})

