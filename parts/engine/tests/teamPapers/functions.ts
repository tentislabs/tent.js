import { action, anyone, change, files, input, query, sessions, text } from 'tentjs'
import { papers, teams, users } from './tables.ts'

const open = anyone('a test makes its people and teams')

export const addUser = change('addUser', {
  access: 'nobody',
  input: { email: text() },
  set: users.add({ email: input('email'), roles: [] }),
})

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

// Makes a file of the caller from the words: the caller's own, loose until a row holds it.
export const putText = action('putText', {
  access: 'signedIn',
  input: { words: text() },
  output: text(),
  run: async ({ input: given }) => files.put(given.words, { name: 'words.txt' }),
})

export const keepPaper = change('keepPaper', {
  access: 'signedIn',
  input: { team: text(), title: text(), paper: text() },
  run: ({ input: given, user, db }) =>
    db.papers.of(given.team).add({ by: user.id, title: given.title, paper: given.paper }).id,
  output: text(),
})

export const swapPaper = change('swapPaper', {
  access: 'signedIn',
  input: { team: text(), row: text(), paper: text() },
  run: ({ input: given, db }) => {
    db.papers.of(given.team).change(given.row, { paper: given.paper })
  },
})

// Reads the words of a file, by the rule of a download for the caller.
export const readPaper = action('readPaper', {
  access: 'signedIn',
  input: { id: text() },
  output: text(),
  run: async ({ input: given }) => new TextDecoder().decode(await files.get(given.id)),
})

export const dropTeam = change('dropTeam', {
  access: open,
  input: { team: text() },
  set: teams.remove(input('team')),
})

export const papersOf = query('papersOf', {
  access: open,
  input: { team: text() },
  rows: papers.of(input('team')).oldest('title'),
})

// Who the caller is, as the session of the request names them.
export const whoAmI = query('whoAmI', { access: open, output: text(), run: ({ user }) => user?.id ?? 'no user' })

// Signs a user in by their id, as a starter would once it proved who they are.
export const signIn = action('signIn', {
  access: open,
  system: 'a test signs a user in',
  input: { user: text() },
  run: async ({ input: given }) => {
    sessions.start(given.user)
  },
})
