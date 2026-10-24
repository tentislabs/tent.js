import { list, project, table, text } from 'tentjs'

// A rule of a signed-in caller lets in whoever the app's own sign-up lets in.
export const signedUp = project('signedUp', { backups: { every: false } })

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const notes = table('notes', {
  columns: { words: text() },
  access: { read: 'anyone', add: 'signedIn' },
})
