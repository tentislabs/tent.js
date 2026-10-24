import { action, link, number, query, table, text } from 'tentjs'

export const summarize = action('summarize', {
  access: 'nobody',
  system: 'fills the summary of a note from its own columns',
  input: { title: text(), body: text() },
  output: text(),
  run: async ({ input }) => `${input.title}: ${input.body}`,
})

export const measure = action('measure', {
  access: 'nobody',
  system: 'fills the length of a summary',
  input: { text: text() },
  output: number(),
  run: async ({ input }) => input.text.length,
})

export const authors = table('authors', { columns: { name: text() }, access: { read: 'signedIn' } })

// A summary that work makes, a length made from that summary, and the name of the author read through a link.
export const notes = table('notes', {
  columns: {
    title: text(),
    body: text(),
    author: link('authors', { optional: true }),
    summary: text({ optional: true, by: summarize }),
    length: number({ optional: true, by: { work: measure, input: { text: 'summary' } } }),
  },
  access: { read: 'signedIn' },
})

export const oldNotes = query('oldNotes', { access: 'signedIn', rows: notes.where({ summary: { filled: 'old' } }).limit(50) })
