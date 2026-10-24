import { action, number, query, table, text } from 'tentjs'

export const summarize = action('summarize', {
  access: 'nobody',
  system: 'fills the summary of a note from its own columns',
  input: { title: text(), body: text() },
  output: text(),
  run: async ({ input }) => `${input.title}: ${input.body}`,
})

export const echo = action('echo', {
  access: 'nobody',
  system: 'fills a text from another',
  input: { text: text() },
  output: text(),
  run: async ({ input }) => input.text,
})

// Work that states no `system`, and work that states `rows`.
export const loose = action('loose', {
  access: 'nobody',
  input: { title: text() },
  output: text(),
  run: async ({ input }) => input.title,
})

export const others = table('others', { columns: { name: text() }, access: { read: 'signedIn' } })

export const counted = query('counted', { access: 'signedIn', rows: others.count() })

export const withRows = action('withRows', {
  access: 'nobody',
  system: 'fills a text, and reads rows besides',
  input: { title: text() },
  output: text(),
  rows: { others: others.limit(5) },
  run: async ({ input }) => input.title,
})

export const notes = table('notes', {
  columns: {
    title: text(),
    body: text(),
    // A filled column that is required.
    required: text({ by: summarize }),
    // A `by` that names a query.
    byQuery: text({ optional: true, by: counted }),
    // An `input` that names no column of the row.
    nowhere: text({ optional: true, by: { work: summarize, input: { title: 'title', body: 'nothing' } } }),
    // Two columns that each read the other.
    ringOne: text({ optional: true, by: { work: echo, input: { text: 'ringTwo' } } }),
    ringTwo: text({ optional: true, by: { work: echo, input: { text: 'ringOne' } } }),
    // An answer that does not fit the column.
    size: number({ optional: true, by: summarize }),
    // Work that states no `system`.
    looseOne: text({ optional: true, by: loose }),
    // Work that states `rows`.
    rowsOne: text({ optional: true, by: withRows }),
  },
  access: { read: 'signedIn' },
})

// A filter with `filled` on a column that states no `by`.
export const oldTitles = query('oldTitles', { access: 'signedIn', rows: notes.where({ title: { filled: 'old' } }).limit(50) })
