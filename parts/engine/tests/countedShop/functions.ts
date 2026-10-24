import { action, files, list, query, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', { columns: { title: text() }, access: { read: 'signedIn' } })

export const listNotes = query('listNotes', { access: 'signedIn', input: {}, rows: notes.limit(20) })

// A paper that a caller keeps as a loose file of their own.
export const keepPaper = action('keepPaper', {
  access: 'signedIn',
  input: { text: text() },
  output: text(),
  run: async ({ input }) => files.put(input.text, { name: 'paper.txt', kind: 'text/plain' }),
})
