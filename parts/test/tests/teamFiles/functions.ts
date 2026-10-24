import { action, anyone, change, fail, file, files, input, link, list, query, sessions, table, text } from 'tentjs'

const open = anyone('a test signs in and makes its teams')

export const users = table('users', {
  columns: { email: text({ unique: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: 'anyone', add: 'anyone', remove: 'anyone' },
})

// The papers of each team stand in a data file of that team, and each is read by the person it belongs to.
export const papers = table('papers', {
  columns: { team: link('teams', { onRemove: 'remove' }), by: link('users'), title: text(), paper: file() },
  tenant: 'team',
  owner: 'by',
  access: { read: 'owner', add: 'signedIn', remove: 'owner' },
})

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  run: ({ input: given, db }) => db.teams.add({ name: given.name }).id,
  output: text(),
})

export const dropTeam = change('dropTeam', {
  access: open,
  input: { team: text() },
  set: teams.remove(input('team')),
})

export const keepPaper = change('keepPaper', {
  access: 'signedIn',
  input: { team: text(), title: text(), paper: file() },
  run: ({ input: given, user, db }) =>
    db.papers.of(given.team).add({ by: user.id, title: given.title, paper: given.paper }).id,
  output: text(),
})

// Keeps a paper and then fails: the write of the tenant is undone, after the hold of its file was written.
export const keepAndFail = change('keepAndFail', {
  access: 'signedIn',
  input: { team: text(), title: text(), paper: file() },
  run: ({ input: given, user, db }) => {
    db.papers.of(given.team).add({ by: user.id, title: given.title, paper: given.paper })
    return fail('undone', 'The paper is not kept after all.')
  },
})

export const papersOf = query('papersOf', {
  access: 'signedIn',
  input: { team: text() },
  rows: papers.of(input('team')).oldest('title'),
})

export const dropPaper = change('dropPaper', {
  access: 'signedIn',
  input: { team: text(), row: text() },
  set: papers.of(input('team')).remove(input('row')),
})

export const putText = action('putText', {
  access: 'signedIn',
  input: { words: text() },
  output: text(),
  run: async ({ input: given }) => files.put(given.words, { name: 'words.txt' }),
})

export const signIn = action('signIn', {
  access: open,
  system: 'finds the user that signs in, whom nobody may read yet',
  input: { email: text() },
  run: async ({ input: given, db }) => {
    const user = await db.system.users.where({ email: given.email }).first()
    if (user) sessions.start(user.id)
  },
})
