import { action, anyone, files, json, list, mail, table, text } from 'tentjs'

const open = anyone('a test sends mail')

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

// Sends the message that a test hands it, as the caller of the call.
export const send = action('send', {
  access: open,
  input: { message: json() },
  run: async ({ input: given }) => mail.send(Object(given.message)),
})

// Full access reaches every file, the file of another caller among them.
export const sendAsSystem = action('sendAsSystem', {
  access: open,
  system: 'a test attaches a file with full access',
  input: { message: json() },
  run: async ({ input: given }) => mail.send(Object(given.message)),
})

export const keep = action('keep', {
  access: 'signedIn',
  input: { words: text(), name: text() },
  output: text(),
  run: async ({ input: given }) => files.put(given.words, { name: given.name }),
})
