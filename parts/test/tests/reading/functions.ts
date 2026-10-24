import { action, anyone, change, files, input, list, query, table, text } from 'tentjs'

const open = anyone('a test reads files')

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// What is searched by its words, and written by everyone, for a search and a copy of the builder's own.
export const notes = table('notes', {
  columns: { body: text() },
  search: ['body'],
  access: { read: 'anyone', add: 'anyone' },
})

export const addNote = change('addNote', {
  access: open,
  input: { body: text() },
  set: notes.add({ body: input('body') }),
})

export const findNotes = query('findNotes', {
  access: open,
  input: { words: text() },
  output: list(text()),
  run: ({ input: given, db }) =>
    db.notes
      .search(given.words)
      .all()
      .map((one) => one.body),
})

// Makes a file of the caller from bytes that a test hands over.
export const keep = action('keep', {
  access: open,
  input: { base64: text(), name: text(), kind: text({ optional: true }) },
  output: text(),
  run: async ({ input: given }) =>
    files.put(new Uint8Array(Buffer.from(given.base64, 'base64')), {
      name: given.name,
      ...(given.kind === undefined ? {} : { kind: given.kind }),
    }),
})

export const words = action('words', {
  access: open,
  input: { id: text() },
  output: text(),
  run: async ({ input: given }) => files.text(given.id),
})

export const wordsAsSystem = action('wordsAsSystem', {
  access: open,
  system: 'a test reads a file with full access',
  input: { id: text() },
  output: text(),
  run: async ({ input: given }) => files.text(given.id),
})

export const bytesOf = action('bytesOf', {
  access: open,
  input: { id: text() },
  output: text(),
  run: async ({ input: given }) => Buffer.from(await files.get(given.id)).toString('utf8'),
})

// Reads a file with full access, and changes nothing: a reader answers it itself.
export const wordsHere = action('wordsHere', {
  access: open,
  system: 'a test reads a file on a reader',
  changes: false,
  input: { id: text() },
  output: text(),
  run: async ({ input: given }) => files.text(given.id),
})
